'use strict';

// Behavioural checks for the status-overview include. The include is a LuCI
// module that expects globals (E, _, L, fs, document, localStorage) and does a
// top-level `return`, so it cannot be require()d. We evaluate it in a sandbox
// with stubs and drive the same entry points LuCI does: load() and render().
//
// This is deliberately outside the SDK build: it runs in a second on every
// push, whereas the SDK builds only prove that files are packaged.

const realFs = require('fs');
const path = require('path');
const assert = require('assert');

const MODULE_PATH = path.join(__dirname, '..',
	'htdocs/luci-static/resources/view/status/include/18_corestatus.js');

String.prototype.format = function() {
	const args = Array.prototype.slice.call(arguments);
	let i = 0;
	return String(this).replace(/%([%sd])/g, (m, c) => {
		if (c === '%') return '%';
		const v = args[i++];
		return (c === 'd') ? String(parseInt(v, 10)) : String(v);
	});
};

function makeE() {
	return function E(tag, attr) {
		const children = [];
		for (let i = 2; i < arguments.length; i++) {
			const c = arguments[i];
			if (c == null) continue;
			if (Array.isArray(c)) children.push(...c.flat(Infinity));
			else children.push(c);
		}
		const el = {
			tag,
			attr: attr || {},
			children,
			classList: { add() {}, remove() {} },
			replaceWith() {},
		};
		if (tag === 'table' || tag === 'div' || tag === 'span')
			el.append = function() {
				for (let i = 0; i < arguments.length; i++) {
					const c = arguments[i];
					if (c == null) continue;
					if (Array.isArray(c)) el.children.push(...c.flat(Infinity));
					else el.children.push(c);
				}
			};
		return el;
	};
}

// A fake sysfs/procfs tree: exact paths map to file contents, and list() is
// derived from the same map so discovery sees directories consistently.
function makeFs(tree) {
	return {
		read(p) {
			if (Object.prototype.hasOwnProperty.call(tree, p))
				return Promise.resolve(tree[p]);
			return Promise.reject(new Error('ENOENT: ' + p));
		},
		list(p) {
			const names = new Set();
			for (const k of Object.keys(tree)) {
				if (!k.startsWith(p + '/')) continue;
				const first = k.slice(p.length + 1).split('/')[0];
				if (first) names.add(first);
			}
			if (!names.size)
				return Promise.reject(new Error('ENOENT: ' + p));
			return Promise.resolve([...names].map(name => ({ name, type: 'link' })));
		},
	};
}

function instantiate(tree) {
	const E = makeE();
	const document = { head: { append() {} } };
	const localStorage = { getItem: () => null, setItem() {} };
	const _ = s => s;
	const L = {
		resolveDefault(promise, def) {
			return Promise.resolve(promise).catch(() => def);
		},
	};
	const fs = makeFs(tree);
	const baseclass = { extend: o => o };
	const temperatureOverview = {
		load: () => Promise.resolve(null),
		render: () => null,
	};

	const src = realFs.readFileSync(MODULE_PATH, 'utf8');
	const factory = new Function(
		'baseclass', '_', 'E', 'L', 'fs', 'document', 'localStorage', 'temperatureOverview',
		src + '\n//# sourceURL=' + MODULE_PATH);

	return factory(baseclass, _, E, L, fs, document, localStorage, temperatureOverview);
}

const CPU_STAT = [
	'cpu  100 0 100 800 0 0 0 0 0 0',
	'cpu0 50 0 50 400 0 0 0 0 0 0',
	'cpu1 50 0 50 400 0 0 0 0 0 0',
	'',
].join('\n');

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('section title', () => {
	const m = instantiate({});
	assert.strictEqual(m.title, 'Load and Temperature');
});

test('device classification', () => {
	const m = instantiate({});
	assert.strictEqual(m.classifyDevice('fb000000.gpu'), 'gpu');
	assert.strictEqual(m.classifyDevice('mali-0'), 'gpu');
	assert.strictEqual(m.classifyDevice('fdab0000.npu'), 'npu');
	assert.strictEqual(m.classifyDevice('rknpu'), 'npu');
	assert.strictEqual(m.classifyDevice('intel_vpu'), 'npu');
	assert.strictEqual(m.classifyDevice('etnaviv'), 'gpu');
	assert.strictEqual(m.classifyDevice('nna'), 'npu');
	assert.strictEqual(m.classifyDevice('ethosu'), 'npu');
	assert.strictEqual(m.classifyDevice('gpu_ebc'), null);
	assert.strictEqual(m.classifyDevice('rkvdec'), null);
	assert.strictEqual(m.classifyDevice('dmc'), null);
	assert.strictEqual(m.classifyDevice(''), null);
	assert.strictEqual(m.classifyDevice(null), null);
});

test('load parsers', () => {
	const m = instantiate({});
	assert.strictEqual(m.parsePercent('12@800000000Hz'), 12);
	assert.strictEqual(m.parsePercent('0@800000000Hz'), 0);
	assert.strictEqual(m.parsePercent(' 150 %\n'), 100);
	assert.strictEqual(m.parsePercent(''), null);
	assert.strictEqual(m.parsePercent(null), null);
	assert.strictEqual(m.parseRknpuLoad('NPU load:  Core0: 12%, Core1: 34%, Core2:  0%,\n'), 15.3);
	assert.strictEqual(m.parseRknpuLoad('NPU load: 15%'), 15);
	assert.strictEqual(m.parseRknpuLoad('garbage'), null);
	assert.strictEqual(m.parseKgslBusy('100 400'), 25);
	assert.strictEqual(m.parseKgslBusy('0 0'), null);
	assert.strictEqual(m.parseKgslBusy('12'), null);
	assert.strictEqual(m.parseTegraLoad('450'), 45);
	assert.strictEqual(m.parseTegraLoad('1000'), 100);
	assert.strictEqual(m.formatFrequency('800000000\n'), '800 MHz');
	assert.strictEqual(m.formatFrequency('198000000'), '198 MHz');
	assert.strictEqual(m.formatFrequency('1000000'), '1 MHz');
	assert.strictEqual(m.formatFrequency('500000'), '500 kHz');
	assert.strictEqual(m.formatFrequency('0'), null);
	assert.strictEqual(m.parseUtilization('42'), 42);
	assert.strictEqual(m.parseUtilization('12@800000000Hz'), 12);
	assert.strictEqual(m.parseUtilization('23 %'), 23);
	assert.strictEqual(m.parseUtilization('120 400'), 30);
	assert.strictEqual(m.parseUtilization('350'), 35);
	assert.strictEqual(m.parseUtilization('1000'), 100);
	assert.strictEqual(m.parseUtilization('2500'), null);
	assert.strictEqual(m.parseUtilization(''), null);
	assert.strictEqual(m.parseClock('600'), '600 MHz');
	assert.strictEqual(m.parseClock('800000000'), '800 MHz');
	assert.strictEqual(m.parseClock('0'), null);
});

test('Rockchip: GPU devfreq + rknpu debugfs', async () => {
	const m = instantiate({
		'/sys/class/devfreq/fb000000.gpu/name': 'fb000000.gpu\n',
		'/sys/class/devfreq/fb000000.gpu/load': '12@800000000Hz\n',
		'/sys/class/devfreq/fb000000.gpu/cur_freq': '800000000\n',
		'/sys/class/devfreq/fdab0000.npu/name': 'fdab0000.npu\n',
		'/sys/class/devfreq/fdab0000.npu/load': '0@1000000000Hz\n',
		'/sys/class/devfreq/fdab0000.npu/cur_freq': '1000000000\n',
		'/sys/kernel/debug/rknpu/load': 'NPU load:  Core0: 12%, Core1: 34%, Core2:  0%,\n',
	});
	const accs = await m.loadAccelerators();
	assert.strictEqual(accs.length, 2, JSON.stringify(accs));
	const gpu = accs.find(a => a.kind === 'gpu');
	const npu = accs.find(a => a.kind === 'npu');
	assert.deepStrictEqual(gpu, { kind: 'gpu', name: 'fb000000.gpu', load: 12, frequency: '800 MHz' });
	// rknpu's devfreq get_dev_status() is a no-op, so its load is always 0;
	// debugfs must win over the devfreq entry.
	assert.deepStrictEqual(npu, { kind: 'npu', name: 'rknpu', load: 15.3, frequency: null });
});

test('Adreno: kgsl percentage', async () => {
	const m = instantiate({
		'/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage': '23 %\n',
	});
	assert.deepStrictEqual(await m.loadAccelerators(),
		[{ kind: 'gpu', name: 'Adreno', load: 23, frequency: null }]);
});

test('Adreno: kgsl gpubusy fallback', async () => {
	const m = instantiate({
		'/sys/class/kgsl/kgsl-3d0/gpubusy': '100 400\n',
	});
	assert.deepStrictEqual(await m.loadAccelerators(),
		[{ kind: 'gpu', name: 'Adreno', load: 25, frequency: null }]);
});

test('amdgpu and Tegra', async () => {
	const m = instantiate({
		'/sys/class/drm/card0/device/gpu_busy_percent': '7\n',
	});
	assert.deepStrictEqual(await m.loadAccelerators(),
		[{ kind: 'gpu', name: 'amdgpu', load: 7, frequency: null }]);

	const t = instantiate({
		'/sys/devices/platform/gpu.0/load': '450\n',
	});
	assert.deepStrictEqual(await t.loadAccelerators(),
		[{ kind: 'gpu', name: 'Tegra', load: 45, frequency: null }]);
});

test('vendor devfreq load attributes', async () => {
	const m = instantiate({
		'/sys/class/devfreq/mtk-gpu/name': 'mtk-gpu\n',
		'/sys/class/devfreq/mtk-gpu/gpu_load': '37\n',
		'/sys/class/devfreq/mtk-gpu/cur_freq': '700000000\n',
		'/sys/class/devfreq/apu/name': 'apu\n',
		'/sys/class/devfreq/apu/utilisation': '44\n',
	});
	const accs = await m.loadAccelerators();
	const gpu = accs.find(a => a.kind === 'gpu');
	const npu = accs.find(a => a.kind === 'npu');
	assert.deepStrictEqual(gpu, { kind: 'gpu', name: 'mtk-gpu', load: 37, frequency: '700 MHz' });
	assert.deepStrictEqual(npu, { kind: 'npu', name: 'apu', load: 44, frequency: null });
});

test('devfreq per-mille and busy/total load formats', async () => {
	const m = instantiate({
		'/sys/class/devfreq/kgsl-3d0/name': 'kgsl-3d0\n',
		'/sys/class/devfreq/kgsl-3d0/load': '120 400\n',
		'/sys/class/devfreq/kgsl-3d0/cur_freq': '800000000\n',
		'/sys/class/devfreq/npu/name': 'npu\n',
		'/sys/class/devfreq/npu/load': '350\n',
	});
	const accs = await m.loadAccelerators();
	const gpu = accs.find(a => a.kind === 'gpu');
	const npu = accs.find(a => a.kind === 'npu');
	assert.deepStrictEqual(gpu, { kind: 'gpu', name: 'kgsl-3d0', load: 30, frequency: '800 MHz' });
	assert.deepStrictEqual(npu, { kind: 'npu', name: 'npu', load: 35, frequency: null });
});

test('devfreq frequency without a load counter', async () => {
	const m = instantiate({
		'/sys/class/devfreq/mali/name': 'mali\n',
		'/sys/class/devfreq/mali/cur_freq': '700000000\n',
	});
	const accs = await m.loadAccelerators();
	assert.deepStrictEqual(accs, [
		{ kind: 'gpu', name: 'mali', load: null, frequency: '700 MHz' },
	]);

	// No load counter means no progress bar: only the details line is drawn.
	const el = m.render({ cpuData: CPU_STAT, accelerators: accs });
	const row = el.children[3].children[0];
	assert.strictEqual(row.children[0].children[0], 'GPU Frequency');
	assert.strictEqual(row.children[1].children.length, 1);
	assert.strictEqual(row.children[1].children[0].children[0], '700 MHz');
});

test('Mali misc utilization and clock', async () => {
	const m = instantiate({
		'/sys/class/misc/mali0/device/utilization': '42\n',
		'/sys/class/misc/mali0/device/clock': '600\n',
	});
	assert.deepStrictEqual(await m.loadAccelerators(),
		[{ kind: 'gpu', name: 'mali0', load: 42, frequency: '600 MHz' }]);
});

test('misc NPU busy/total counter', async () => {
	const m = instantiate({
		'/sys/class/misc/npu/device/busy': '120 400\n',
	});
	assert.deepStrictEqual(await m.loadAccelerators(),
		[{ kind: 'npu', name: 'npu', load: 30, frequency: null }]);
});

test('misc entry duplicating a devfreq accelerator is ignored', async () => {
	const m = instantiate({
		'/sys/class/devfreq/mali-0/name': 'mali-0\n',
		'/sys/class/devfreq/mali-0/load': '10@500000000Hz\n',
		'/sys/class/devfreq/mali-0/cur_freq': '500000000\n',
		'/sys/class/misc/mali0/device/utilization': '42\n',
	});
	const accs = await m.loadAccelerators();
	assert.strictEqual(accs.length, 1, JSON.stringify(accs));
	assert.strictEqual(accs[0].name, 'mali-0');
});

test('Airoha NPU: presence without a load counter', async () => {
	const m = instantiate({
		'/sys/bus/platform/drivers/airoha-npu/1e900000.npu/uevent': '',
		'/sys/kernel/debug/clk/npu/clk_rate': '800000000\n',
	});
	const accs = await m.loadAccelerators();
	assert.deepStrictEqual(accs, [{
		kind: 'npu', name: 'Airoha NPU', load: null, frequency: '800 MHz',
	}]);

	// No load counter means no progress bar: only the details line is drawn.
	const el = m.render({ cpuData: CPU_STAT, accelerators: accs });
	const row = el.children[3].children[0];
	assert.strictEqual(row.children[0].children[0], 'NPU Frequency');
	assert.strictEqual(row.children[1].children.length, 1);
	assert.strictEqual(row.children[1].children[0].children[0], '800 MHz');
});

test('Airoha NPU is not added when another NPU was found', async () => {
	const m = instantiate({
		'/sys/class/devfreq/rknpu/name': 'rknpu\n',
		'/sys/class/devfreq/rknpu/load': '45@1000000000Hz\n',
		'/sys/class/devfreq/rknpu/cur_freq': '1000000000\n',
		'/sys/bus/platform/drivers/airoha-npu/1e900000.npu/uevent': '',
		'/sys/kernel/debug/clk/npu/clk_rate': '800000000\n',
	});
	const accs = await m.loadAccelerators();
	assert.strictEqual(accs.length, 1, JSON.stringify(accs));
	assert.strictEqual(accs[0].name, 'rknpu');
});

test('NPU-only device', async () => {
	const m = instantiate({
		'/sys/class/devfreq/rknpu/name': 'rknpu\n',
		'/sys/class/devfreq/rknpu/load': '45@1000000000Hz\n',
		'/sys/class/devfreq/rknpu/cur_freq': '1000000000\n',
	});
	assert.deepStrictEqual(await m.loadAccelerators(),
		[{ kind: 'npu', name: 'rknpu', load: 45, frequency: '1000 MHz' }]);
});

test('device without GPU/NPU renders only CPU info', async () => {
	const m = instantiate({});
	const accs = await m.loadAccelerators();
	assert.deepStrictEqual(accs, []);
	assert.strictEqual(m.makeAcceleratorTable(accs), null);

	const el = m.render({ cpuData: CPU_STAT, accelerators: accs });
	assert.strictEqual(el.tag, 'div');
	assert.strictEqual(el.children.length, 3);
	assert.strictEqual(el.children[0].tag, 'h4');
	assert.strictEqual(el.children[0].children[0], 'Load');
	assert.strictEqual(el.children[1].attr['class'], 'corestatus-view-modes');
	assert.ok(!el.children.some(c =>
		c && c.tag === 'table' && String(c.attr['class']).includes('corestatus')));
});

test('CPU frequency: current value from cpufreq', async () => {
	const m = instantiate({
		'/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq': '1200000\n',
	});
	assert.strictEqual(await m.loadCpuFrequency(), '1200 MHz');
});

test('CPU frequency: falls back to the highest device-tree OPP', async () => {
	const m = instantiate({
		'/sys/firmware/devicetree/base/opp-table/opp-500000000/opp-hz': '',
		'/sys/firmware/devicetree/base/opp-table/opp-1200000000/opp-hz': '',
	});
	assert.strictEqual(await m.loadCpuFrequency(), '1200 MHz');
});

test('CPU frequency: no source means no value', async () => {
	const m = instantiate({});
	assert.strictEqual(await m.loadCpuFrequency(), null);
});

test('render: CPU frequency row above the accelerator rows', async () => {
	const m = instantiate({});
	const el = m.render({
		cpuData: CPU_STAT,
		cpuFrequency: '1200 MHz',
		accelerators: [
			{ kind: 'npu', name: 'Airoha NPU', load: null, frequency: '800 MHz' },
		],
	});
	const rows = el.children[3].children.filter(c => c && c.tag === 'tr');
	assert.deepStrictEqual(rows.map(r => r.children[0].children[0]),
		['CPU Frequency', 'NPU Frequency']);
	assert.strictEqual(rows[0].children[1].children[0].children[0], '1200 MHz');

	// Without accelerators the row still renders in its own table.
	const solo = m.render({ cpuData: CPU_STAT, cpuFrequency: '1200 MHz', accelerators: [] });
	assert.strictEqual(solo.children[3].tag, 'table');
	assert.strictEqual(
		solo.children[3].children[0].children[0].children[0], 'CPU Frequency');
});

test('render: accelerator rows below the CPU table', async () => {
	const m = instantiate({
		'/sys/class/devfreq/mali-0/name': 'mali-0\n',
		'/sys/class/devfreq/mali-0/load': '10@500000000Hz\n',
		'/sys/class/devfreq/mali-0/cur_freq': '500000000\n',
		'/sys/class/devfreq/mali-1/name': 'mali-1\n',
		'/sys/class/devfreq/mali-1/load': '30@800000000Hz\n',
		'/sys/class/devfreq/mali-1/cur_freq': '800000000\n',
		'/sys/kernel/debug/rknpu/load': 'NPU load: 20%',
	});
	const accelerators = await m.loadAccelerators();
	const el = m.render({ cpuData: CPU_STAT, accelerators });

	assert.strictEqual(el.tag, 'div');
	assert.strictEqual(el.children.length, 4);
	const accelTable = el.children[3];
	assert.strictEqual(accelTable.tag, 'table');
	assert.ok(String(accelTable.attr['class']).includes('corestatus-table'));

	const rows = accelTable.children.filter(c => c && c.tag === 'tr');
	assert.strictEqual(rows.length, 3);

	const labels = rows.map(r => r.children[0].children[0]);
	assert.deepStrictEqual(labels, ['GPU 1 Load', 'GPU 2 Load', 'NPU Load']);

	const titles = rows.map(r => r.children[1].children[0].attr.title);
	assert.deepStrictEqual(titles, ['10%', '30%', '20%']);

	const details = rows.map(r => r.children[1].children[1].children[0]);
	assert.deepStrictEqual(details, ['mali-0 · 500 MHz', 'mali-1 · 800 MHz', 'rknpu']);
});

test('render: accelerator without a load counter shows details only', async () => {
	const m = instantiate({});
	const accel = { kind: 'gpu', name: 'kgsl-3d0', load: null, frequency: null };
	const el = m.render({ cpuData: CPU_STAT, accelerators: [accel] });
	const row = el.children[3].children[0];
	assert.strictEqual(row.children[0].children[0], 'GPU');
	assert.strictEqual(row.children[1].children.length, 1);
	assert.strictEqual(row.children[1].children[0].attr['class'], 'corestatus-detail');
	assert.strictEqual(row.children[1].children[0].children[0], 'kgsl-3d0');
});

test('accelerator label follows the available data', () => {
	const m = instantiate({});
	const el = m.render({ cpuData: CPU_STAT, accelerators: [
		{ kind: 'gpu', name: 'mali-0', load: 12, frequency: '500 MHz' },
		{ kind: 'npu', name: 'rknpu', load: 20, frequency: null },
		{ kind: 'gpu', name: 'mali-1', load: null, frequency: '800 MHz' },
		{ kind: 'npu', name: 'Airoha NPU', load: null, frequency: '800 MHz' },
	]});
	const labels = el.children[3].children.map(r => r.children[0].children[0]);
	assert.deepStrictEqual(labels,
		['GPU 1 Load', 'NPU 1 Load', 'GPU 2 Frequency', 'NPU 2 Frequency']);

	// Here both GPUs and both NPUs are pairs, so the names stay to tell the
	// rows apart; a lone frequency-only device drops them (tested separately).
	const details = el.children[3].children.map(
		r => r.children[1].children[r.children[1].children.length - 1].children[0]);
	assert.deepStrictEqual(details,
		['mali-0 · 500 MHz', 'rknpu', 'mali-1 · 800 MHz', 'Airoha NPU · 800 MHz']);
});

test('discovery is cached across polls', async () => {
	const m = instantiate({
		'/sys/class/devfreq/fb000000.gpu/name': 'fb000000.gpu\n',
		'/sys/class/devfreq/fb000000.gpu/load': '12@800000000Hz\n',
		'/sys/class/devfreq/fb000000.gpu/cur_freq': '800000000\n',
	});
	const first = await m.discoverAccelerators();
	const second = await m.discoverAccelerators();
	assert.strictEqual(first, second);
	assert.strictEqual(first.length, 1);
});

test('load() returns CPU, accelerator and frequency data', async () => {
	const m = instantiate({
		'/proc/stat': CPU_STAT,
		'/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq': '1200000\n',
		'/sys/class/devfreq/fb000000.gpu/name': 'fb000000.gpu\n',
		'/sys/class/devfreq/fb000000.gpu/load': '12@800000000Hz\n',
		'/sys/class/devfreq/fb000000.gpu/cur_freq': '800000000\n',
	});
	const data = await m.load();
	assert.strictEqual(data.cpuData, CPU_STAT);
	assert.strictEqual(data.cpuFrequency, '1200 MHz');
	assert.deepStrictEqual(data.accelerators,
		[{ kind: 'gpu', name: 'fb000000.gpu', load: 12, frequency: '800 MHz' }]);
});

(async () => {
	let failures = 0;
	for (const [name, fn] of tests) {
		try {
			await fn();
			console.log('PASS  ' + name);
		} catch (err) {
			failures++;
			console.error('FAIL  ' + name);
			console.error(err && err.stack || err);
		}
	}
	console.log(failures
		? '\n' + failures + ' test(s) failed'
		: '\nALL INTEGRATION CHECKS PASSED');
	process.exit(failures ? 1 : 0);
})();
