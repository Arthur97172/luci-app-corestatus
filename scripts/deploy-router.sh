#!/bin/sh
#
# Deploy luci-app-corestatus to a running OpenWrt device over SSH.
#
# Copies root/ and htdocs/ into the device filesystem, installs the compiled
# Simplified Chinese translation when a PO compiler is available, applies the
# status overview patch some vendor firmware needs, refreshes rpcd/LuCI caches
# and verifies the result. Every step is idempotent: running the script twice
# is safe.
#
# Usage: scripts/deploy-router.sh [options] [user@]host
#
# Options:
#   --no-overview-patch   do not touch the device's status overview view
#   --no-translate        skip installing the Simplified Chinese translation
#   -h, --help            show this help
#
# Environment:
#   SSHPASS      password for password authentication (used via sshpass -e)
#   SSH_OPTS     extra options passed to every ssh invocation
#   PO2LMO       PO -> LMO compiler, e.g. "node /path/to/po2lmo.mjs";
#                defaults to a po2lmo found in PATH, and is skipped if absent
#
# Examples:
#   scripts/deploy-router.sh root@192.168.10.224
#   SSHPASS=secret scripts/deploy-router.sh 192.168.10.224
#
set -eu

cd "$(dirname "$0")/.."

usage() {
	sed -n '2,/^set -eu$/p' "$0" | sed -e 's/^# \{0,1\}//' -e '/^set -eu$/d'
}

TARGET=
PATCH_OVERVIEW=1
TRANSLATE=1

while [ $# -gt 0 ]; do
	case "$1" in
		--no-overview-patch) PATCH_OVERVIEW=0 ;;
		--no-translate)      TRANSLATE=0 ;;
		-h|--help)           usage; exit 0 ;;
		-*)                  usage >&2; exit 1 ;;
		*)                   [ -z "$TARGET" ] || { usage >&2; exit 1; }; TARGET=$1 ;;
	esac
	shift
done

if [ -z "$TARGET" ]; then
	usage >&2
	exit 1
fi

case "$TARGET" in
	*@*) ;;
	*)   TARGET="root@$TARGET" ;;
esac

SSH="ssh"
if [ -n "${SSHPASS:-}" ] && command -v sshpass >/dev/null 2>&1; then
	SSH="sshpass -e ssh"
fi
SSH_OPTS=${SSH_OPTS:-}

remote() { $SSH $SSH_OPTS "$TARGET" "$@"; }
remote_sh() { $SSH $SSH_OPTS "$TARGET" 'sh -s'; }

fail=0
step() { printf '\n== %s\n' "$*"; }
ok()   { printf '  ok    %s\n' "$*"; }
warn() { printf '  warn  %s\n' "$*"; }
bad()  { printf '  FAIL  %s\n' "$*"; fail=1; }

step "deploy application files"
tar -C root -cf - . | remote 'cd / && tar xf -' || { bad "copying root/"; exit 1; }
ok "root/ -> /"
tar -C htdocs -cf - . | remote 'cd /www && tar xf -' || { bad "copying htdocs/"; exit 1; }
ok "htdocs/ -> /www"

remote_sh <<'REMOTE' || { bad "fixing file permissions"; exit 1; }
set -eu
chmod 644 /usr/share/rpcd/ucode/luci.corestatus \
          /usr/share/luci/menu.d/luci-app-corestatus.json \
          /usr/share/rpcd/acl.d/luci-app-corestatus.json \
          /www/luci-static/resources/view/status/corestatus.js \
          /www/luci-static/resources/view/status/include/18_corestatus.js \
          /www/luci-static/resources/svg/corestatus.svg \
          /www/luci-static/resources/svg/temperature.svg
find /www/luci-static/resources/corestatus -type f -exec chmod 644 {} \;
chmod 755 /usr/libexec/corestatus-temp-probe
REMOTE
ok "file permissions"

if [ "$TRANSLATE" = 1 ]; then
	step "install translation"
	po=po/zh_Hans/corestatus.po
	lmo=${TMPDIR:-/tmp}/corestatus.zh-cn.lmo
	trap 'rm -f "$lmo"' EXIT

	compiler=${PO2LMO:-}
	if [ -z "$compiler" ]; then
		compiler=$(command -v po2lmo || true)
	fi

	if [ -z "$compiler" ]; then
		warn "no PO2LMO compiler found; skipping translation (install po2lmo or set PO2LMO)"
	elif sh -c "$compiler \"\$1\" \"\$2\"" sh "$po" "$lmo" 2>/dev/null; then
		if remote '[ -d /usr/lib/lua/luci/i18n ]'; then
			remote 'cat > /usr/lib/lua/luci/i18n/corestatus.zh-cn.lmo && chmod 644 /usr/lib/lua/luci/i18n/corestatus.zh-cn.lmo' < "$lmo"
			ok "corestatus.zh-cn.lmo installed"
		else
			warn "/usr/lib/lua/luci/i18n does not exist; skipping translation"
		fi
	else
		warn "$compiler failed on $po; skipping translation"
	fi
fi

if [ "$PATCH_OVERVIEW" = 1 ]; then
	step "patch status overview include list"
	remote_sh <<'REMOTE' || fail=1
set -eu
F=/www/luci-static/resources/view/status/index.js
B=/root/luci-mod-status-status-index.js.bak

# Stock LuCI discovers view/status/include/*.js automatically, while some
# vendor builds render the overview from a fixed list of include modules and
# never load third-party ones. Only the fixed-list layout needs a patch.
if [ ! -f "$F" ]; then
	echo "  skip  $F not present; no JS overview on this device"
	exit 0
fi
if grep -q "view.status.include.18_corestatus" "$F"; then
	echo "  ok    overview already lists 18_corestatus"
	exit 0
fi

if grep -q "{name:'view.status.include.20_memory'}" "$F"; then
	cp "$F" "$B"
	sed -i "s/{name:'view.status.include.20_memory'}/{name:'view.status.include.18_corestatus'},{name:'view.status.include.20_memory'}/" "$F"
elif grep -q '{name:"view.status.include.20_memory"}' "$F"; then
	cp "$F" "$B"
	sed -i 's/{name:"view.status.include.20_memory"}/{name:"view.status.include.18_corestatus"},{name:"view.status.include.20_memory"}/' "$F"
else
	echo "  skip  overview does not use a fixed include list; patch not needed"
	exit 0
fi

if grep -q "view.status.include.18_corestatus" "$F"; then
	echo "  ok    patched $F (original saved at $B)"
else
	echo "  FAIL  could not patch $F"
	exit 1
fi
REMOTE
fi

step "restart rpcd and clear LuCI caches"
remote_sh <<'REMOTE' || bad "restarting rpcd"
set -eu
/etc/init.d/rpcd restart
rm -f /tmp/luci-indexcache* /tmp/luci-modulecache*
# force the new probe to classify the channels again
rm -f /tmp/luci.corestatus.tempchannels /tmp/luci.corestatus.tempchannels.new
REMOTE
ok "rpcd restarted, caches cleared"

step "verify"
remote_sh <<'REMOTE' || fail=1
set -u
fails=0
note() { printf '  %s  %s\n' "$1" "$2"; }

for i in 1 2 3 4 5; do
	ubus -v list luci.corestatus 2>/dev/null | grep -q getTempStatus && break
	sleep 1
done

if ubus -v list luci.corestatus 2>/dev/null | grep -q getTempStatus; then
	note ok "ubus object luci.corestatus registered"
else
	note FAIL "ubus object luci.corestatus missing"
	fails=1
fi

if ubus call luci.corestatus getTempStatus >/dev/null 2>&1; then
	note ok "getTempStatus returns data"
else
	note FAIL "getTempStatus failed"
	fails=1
fi

for f in /www/luci-static/resources/view/status/corestatus.js \
         /www/luci-static/resources/view/status/include/18_corestatus.js \
         /www/luci-static/resources/corestatus/load-graph.js \
         /www/luci-static/resources/corestatus/tab-nav.js \
         /usr/libexec/corestatus-temp-probe; do
	if [ -f "$f" ]; then
		note ok "$f"
	else
		note FAIL "$f missing"
		fails=1
	fi
done

for u in /luci-static/resources/view/status/corestatus.js \
         /luci-static/resources/view/status/include/18_corestatus.js; do
	if command -v wget >/dev/null 2>&1 && wget -q -O /dev/null "http://127.0.0.1:80$u"; then
		note ok "HTTP $u"
	else
		note warn "HTTP check skipped for $u"
	fi
done

exit $fails
REMOTE

printf '\n'
if [ "$fail" = 0 ]; then
	echo "DEPLOYMENT VERIFIED on $TARGET"
else
	echo "DEPLOYMENT FAILED on $TARGET"
fi
exit "$fail"
