#!/bin/sh
#
# Static checks for the package tree, run by the workflow's `check` job before
# any SDK is downloaded. Everything here is cheap and local; the point is to
# fail on a broken tree before spending ten minutes compiling it twice.
#
set -eu

cd "$(dirname "$0")/.."

fail=0
step() { printf '\n== %s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fail=1; }

step "workflow YAML parses"
if python3 -c 'import yaml; yaml.safe_load(open(".github/workflows/build.yml"))'; then
	ok ".github/workflows/build.yml"
else
	bad ".github/workflows/build.yml is not valid YAML"
fi

step "JavaScript syntax"
for f in htdocs/luci-static/resources/view/status/corestatus.js \
         htdocs/luci-static/resources/view/status/include/18_corestatus.js \
         htdocs/luci-static/resources/corestatus/load-graph.js \
         htdocs/luci-static/resources/corestatus/temperature-graph.js \
         htdocs/luci-static/resources/corestatus/temperature-overview.js; do
	# node --check parses as a script and rejects the top-level `return` that
	# every LuCI view ends with; the Function constructor accepts it.
	if node -e 'new Function(require("fs").readFileSync(process.argv[1], "utf8"))' "$f"; then
		ok "$f"
	else
		bad "$f"
	fi
done

step "JSON"
for f in root/usr/share/luci/menu.d/luci-app-corestatus.json \
         root/usr/share/rpcd/acl.d/luci-app-corestatus.json; do
	if python3 -m json.tool "$f" >/dev/null; then
		ok "$f"
	else
		bad "$f"
	fi
done

step "menu / ACL / view cross references"
if python3 - <<'PY'
import json
import os
import sys

menu = json.load(open('root/usr/share/luci/menu.d/luci-app-corestatus.json'))
acl = json.load(open('root/usr/share/rpcd/acl.d/luci-app-corestatus.json'))

problems = []

expected = {
	'admin/status/realtime/corestatus': ('status/corestatus', '18_corestatus.js'),
}

if set(menu) != set(expected):
	problems.append('menu keys are %r, expected %r' % (sorted(menu), sorted(expected)))

for key, (view, include) in expected.items():
	entry = menu.get(key)
	if not entry:
		continue
	if entry['action']['path'] != view:
		problems.append('%s points at view %r, expected %r' %
		                (key, entry['action']['path'], view))

	view_file = 'htdocs/luci-static/resources/view/%s.js' % view
	include_file = 'htdocs/luci-static/resources/view/%s/include/%s' % \
		(view.rsplit('/', 1)[0], include)
	for f in (view_file, include_file):
		if not os.path.isfile(f):
			problems.append('menu points at missing file %s' % f)

	group = entry['depends']['acl'][0]
	if group != 'luci-app-corestatus':
		problems.append('%s uses ACL group %r, expected luci-app-corestatus' % (key, group))

group = 'luci-app-corestatus'
if group not in acl:
	problems.append('acl.d does not define group %r' % group)
else:
	files = acl[group]['read']['file']
	for want, perm in (('/proc/stat', 'read'),
	                   ('/sys/class/devfreq', 'list'),
	                   ('/sys/class/devfreq/*', 'read'),
	                   ('/sys/class/devfreq/*/gpu_load', 'read'),
	                   ('/sys/class/devfreq/*/utilisation', 'read'),
	                   ('/sys/kernel/debug/rknpu/load', 'read'),
	                   ('/sys/bus/platform/drivers/airoha-npu', 'list'),
	                   ('/sys/kernel/debug/clk/npu/clk_rate', 'read'),
	                   ('/sys/class/misc', 'list'),
	                   ('/sys/class/misc/*', 'read'),
	                   ('/sys/class/misc/*/*', 'read'),
	                   ('/sys/class/misc/*/device/*', 'read'),
	                   ('/sys/devices/*/misc/*/*', 'read'),
	                   ('/sys/devices/*/utilization', 'read'),
	                   ('/sys/devices/*/utilisation', 'read'),
	                   ('/sys/devices/*/load', 'read'),
	                   ('/sys/devices/*/gpu_load', 'read'),
	                   ('/sys/devices/*/busy', 'read'),
	                   ('/sys/devices/*/clock', 'read'),
	                   ('/sys/devices/*/cur_freq', 'read'),
	                   ('/sys/devices/*/frequency', 'read')):
		if perm not in files.get(want, []):
			problems.append('ACL group %r lacks %r on %s' % (group, perm, want))

	ubus = acl[group]['read'].get('ubus', {}).get('luci.corestatus', [])
	for method in ('getSensors', 'getTempData', 'getTempStatus'):
		if method not in ubus:
			problems.append('ACL group %r lacks ubus method luci.corestatus.%s' %
			                (group, method))

for f in ('htdocs/luci-static/resources/corestatus/load-graph.js',
          'htdocs/luci-static/resources/corestatus/temperature-graph.js',
          'htdocs/luci-static/resources/corestatus/temperature-overview.js'):
	if not os.path.isfile(f):
		problems.append('shared module %s is missing' % f)

if not os.path.isfile('root/usr/share/rpcd/ucode/luci.corestatus'):
	problems.append('rpcd ucode script luci.corestatus is missing')
else:
	with open('root/usr/share/rpcd/ucode/luci.corestatus') as f:
		if "'luci.corestatus'" not in f.read():
			problems.append('luci.corestatus does not register ubus object luci.corestatus')

for p in problems:
	print('  FAIL  ' + p)
sys.exit(1 if problems else 0)
PY
then
	ok "menu key, view path, include and ACL group agree"
else
	bad "menu / ACL / view cross references"
fi

step "translations"
for f in po/templates/corestatus.pot po/zh_Hans/corestatus.po; do
	if msgfmt --check -o /dev/null "$f"; then
		ok "$f"
	else
		bad "$f"
	fi
done
langs=$(ls po | grep -v '^templates$' | tr '\n' ' ')
if [ "$langs" = "zh_Hans " ]; then
	ok "only Simplified Chinese is maintained"
else
	bad "unexpected translation directories in po/: $langs"
fi

step "no legacy cpu naming"
legacy=$(find htdocs root po -iname '*cpu*' -print)
if [ -z "$legacy" ]; then
	ok "no cpu-named files remain"
else
	bad "cpu-named paths still present: $legacy"
fi

step "Makefile"
for s in '^PKG_NAME:=luci-app-corestatus$' 'feeds/luci/luci.mk' 'LUCI_TITLE:=' \
         '^LUCI_DEPENDS:=.*+ucode.*+ucode-mod-fs'; do
	if grep -q "$s" Makefile; then
		ok "$s"
	else
		bad "Makefile lacks $s"
	fi
done

printf '\n'
if [ "$fail" = 0 ]; then
	echo "ALL STATIC CHECKS PASSED"
else
	echo "STATIC CHECKS FAILED"
fi
exit "$fail"
