'use strict';
'require baseclass';
'require fs';
'require corestatus.temperature-overview as temperatureOverview';

document.head.append(E('style', {'type': 'text/css'},
`
.corestatus-view-mode-entry {
	display: inline-block;
	cursor: pointer;
	margin: 2px 4px 2px 0 !important;
	padding: 3px 5px;
	border: 1px solid var(--border-color-medium, var(--border-color, rgba(128, 128, 128, 0.4)));
	-webkit-border-radius: 4px;
	-moz-border-radius: 4px;
	border-radius: 4px;
	opacity: 0.7;
	background-color: var(--background-color-low, var(--surface-muted, rgba(128, 128, 128, 0.12)));
	color: inherit;
}
.corestatus-view-mode-entry:hover {
	opacity: 0.9;
}
.corestatus-view-mode-entry:active {
	opacity: 1.0;
}
.corestatus-view-mode-entry-checked {
	border-color: var(--primary-color-high, var(--primary, #1976d2));
	color: var(--primary-color-high, var(--primary, #1976d2));
	opacity: 1.0;
}
.corestatus-view-mode-entry-checked:hover {
	opacity: 1.0;
}
.corestatus-view-modes {
	margin: 0 var(--section-inset, 0.625rem) 1em;
}
.corestatus-table {
	margin-top: 1em;
}
.corestatus-detail {
	display: inline-block;
	margin-top: 2px;
	color: var(--text-color-low, var(--muted-text, #8898aa));
	font-size: 90%;
}
/* Bootstrap dark mode moves --text-color-low close to the background, which
   leaves the details almost invisible; the medium tone stays readable. */
:root[data-darkmode="true"] .corestatus-detail {
	color: var(--text-color-medium, var(--text-color-low, var(--muted-text, #8898aa)));
}
.corestatus-temperature {
	margin-top: 1.25em;
	padding-top: .75em;
	border-top: 1px solid var(--border-color-low, var(--border-color, rgba(128, 128, 128, 0.25)));
}
.corestatus-temperature > h4,
.corestatus-load-title {
	margin: 0 0 .5em;
	font-size: 1em;
}
/* Argon pads a section's first h4 by a full field gap; trim the distance to
   the section title without touching other themes. */
:root[data-argon-mode] .corestatus-load-title {
	padding-top: .5rem;
}
`));

return baseclass.extend({
	title             : _('Load and Temperature'),

	viewName          : 'core_status',

	availableViewModes: {
		0: [ 'allCPUs', _('Load') ],
		1: [ 'allCPUsDetail', _('Detailed load') ],
		2: [ 'eachCPU', _('Load of each CPU') ],
		3: [ 'eachCPUDetail', _('Detailed load of each CPU') ],
	},

	viewMode          : 0,

	lastStatArray     : null,

	acceleratorCache  : null,

	acceleratorScanned: 0,

	restoreSettingsFromLocalStorage() {
		let viewModeLocal = localStorage.getItem(`luci-app-${this.viewName}-viewMode`);
		if(viewModeLocal) {
			this.viewMode = Number(viewModeLocal);
		};
	},

	saveSettingsToLocalStorage(viewMode) {
		if(this.viewMode != viewMode) {
			localStorage.setItem(
				`luci-app-${this.viewName}-viewMode`, String(viewMode));
		};
	},

	parseProcData(data) {
		let cpuStatArray   = [];
		let statItemsArray = data.trim().split('\n').filter(s => s.startsWith('cpu'));

		for(let str of statItemsArray) {
			let arr = str.split(/\s+/).slice(0, 8);
			arr[0]  = (arr[0] == 'cpu') ? Infinity : arr[0].replace('cpu', '');
			cpuStatArray.push(arr.map(e => Number(e)));
		};

		cpuStatArray.sort((a, b) => a[0] - b[0]);

		return cpuStatArray;
	},

	calcCPULoad(cpuStatArray) {
		let retArray = [];
		cpuStatArray.forEach((c, i) => {
			let loadUser = 0,
			    loadNice = 0,
			    loadSys  = 0,
			    loadIdle = 0,
			    loadIo   = 0,
			    loadIrq  = 0,
			    loadSirq = 0,
			    loadAvg  = 0;
			if(this.lastStatArray !== null && this.lastStatArray.cpuNum == c.cpuNum) {
				let user = c[1] - this.lastStatArray[i][1],
				    nice = c[2] - this.lastStatArray[i][2],
				    sys  = c[3] - this.lastStatArray[i][3],
				    idle = c[4] - this.lastStatArray[i][4],
				    io   = c[5] - this.lastStatArray[i][5],
				    irq  = c[6] - this.lastStatArray[i][6],
				    sirq = c[7] - this.lastStatArray[i][7];
				let sum  = user + nice + sys + idle + io + irq + sirq;
				loadUser = Number((100 * user / sum).toFixed(1));
				loadNice = Number((100 * nice / sum).toFixed(1));
				loadSys  = Number((100 * sys / sum).toFixed(1));
				loadIdle = Number((100 * idle / sum).toFixed(1));
				loadIo   = Number((100 * io / sum).toFixed(1));
				loadIrq  = Number((100 * irq / sum).toFixed(1));
				loadSirq = Number((100 * sirq / sum).toFixed(1));
				loadAvg  = Math.round(100 * (user + nice + sys + io + irq + sirq) / sum);
			};
			retArray.push(
				{cpuNum: c[0], loadUser, loadNice, loadSys, loadIdle, loadIo, loadIrq, loadSirq, loadAvg});
		});
		return retArray;
	},

	classifyDevice(name) {
		let devName = String(name || '').toLowerCase();

		// e-ink (EBC) controllers are sometimes exposed as "gpu" devfreq devices
		if(devName.indexOf('ebc') >= 0) return null;

		if(devName.indexOf('npu') >= 0 || devName.indexOf('apu') >= 0 ||
		   devName.indexOf('vpu') >= 0 || devName.indexOf('nna') >= 0 ||
		   devName.indexOf('ethos') >= 0)
			return 'npu';

		if(/(gpu|mali|panfrost|adreno|kgsl|v3d|lima|vivante|galcore|sgpu|powervr|etnaviv|pvr)/.test(devName))
			return 'gpu';

		return null;
	},

	probeDevfreq(entryName) {
		let devPath = '/sys/class/devfreq/' + entryName;

		// Most devfreq drivers expose "load", but vendor kernels also ship
		// "gpu_load" (MediaTek/Allwinner-style) or "utilisation"/"utilization".
		let loadAttrs = [ 'load', 'gpu_load', 'utilisation', 'utilization' ];

		return Promise.all([
			L.resolveDefault(fs.read(devPath + '/name'), entryName),
			Promise.all(loadAttrs.map(attr =>
				L.resolveDefault(fs.read(devPath + '/' + attr), null))),
			L.resolveDefault(fs.read(devPath + '/cur_freq'), null),
		]).then(([rawName, loads, freq]) => {
			let devName = String(rawName || entryName || '').trim() || entryName;
			let kind    = this.classifyDevice(devName) || this.classifyDevice(entryName);
			let index   = loads.findIndex(v => v != null);

			// A devfreq device that only exposes its frequency is still worth
			// a row: the accelerator is there, the load counter just is not.
			if(!kind || (index < 0 && freq == null)) return null;

			return {
				kind    : kind,
				source  : 'devfreq',
				name    : devName,
				path    : devPath,
				loadPath: index >= 0 ? devPath + '/' + loadAttrs[index] : null,
			};
		});
	},

	probeFile(kind, source, candidates, name) {
		let tryNext = i => {
			if(i >= candidates.length) return Promise.resolve(null);

			return L.resolveDefault(fs.read(candidates[i]), null).then(raw => {
				if(raw == null) return tryNext(i + 1);
				return { kind: kind, source: source, name: name, path: candidates[i] };
			});
		};

		return tryNext(0);
	},

	probeMiscDevice(entryName) {
		let kind = this.classifyDevice(entryName);

		if(!kind) return Promise.resolve(null);

		// Mali kbase/Utgard and a number of vendor NPUs are misc devices.
		// Their counters live either next to the class link or below its
		// "device" symlink, depending on the driver, so try both.
		let bases = [ '/sys/class/misc/' + entryName,
		              '/sys/class/misc/' + entryName + '/device' ];
		let loads = [ 'utilization', 'utilisation', 'load', 'gpu_load', 'busy' ];
		let freqs = [ 'clock', 'cur_freq', 'frequency' ];
		let readAll = (attrs, base) =>
			Promise.all(attrs.map(attr =>
				L.resolveDefault(fs.read(base + '/' + attr), null)));

		return Promise.all(bases.map(base => Promise.all([
			readAll(loads, base), readAll(freqs, base),
		]))).then(results => {
			let loadPath = null, freqPath = null;

			for(let i = 0; i < results.length; i++) {
				let [rawLoads, rawFreqs] = results[i];

				if(loadPath == null) {
					let index = rawLoads.findIndex(v => v != null);
					if(index >= 0) loadPath = bases[i] + '/' + loads[index];
				}

				if(freqPath == null) {
					let index = rawFreqs.findIndex(v => v != null);
					if(index >= 0) freqPath = bases[i] + '/' + freqs[index];
				}
			}

			if(loadPath == null && freqPath == null) return null;

			return {
				kind    : kind,
				source  : 'misc',
				name    : entryName,
				path    : loadPath,
				freqPath: freqPath,
			};
		});
	},

	probeMiscAccelerators() {
		return L.resolveDefault(fs.list('/sys/class/misc'), []).then(entries =>
			Promise.all((entries || [])
				.filter(e => this.classifyDevice(e.name))
				.map(e => L.resolveDefault(this.probeMiscDevice(e.name), null)))
		).then(list => (list || []).filter(a => a != null));
	},

	probeAirohaNpu() {
		// The Airoha NPU in AN7581-class SoCs is a packet-offload engine. Its
		// driver publishes no utilisation counter, so presence is all we can
		// detect; readAccelerator() reports the clock and a null load.
		return L.resolveDefault(
			fs.list('/sys/bus/platform/drivers/airoha-npu'), []
		).then(entries => {
			if(!(entries || []).some(e => /\.npu$/.test(e.name)))
				return null;

			return {
				kind  : 'npu',
				source: 'airoha',
				name  : 'Airoha NPU',
				path  : '/sys/kernel/debug/clk/npu/clk_rate',
			};
		});
	},

	discoverAccelerators() {
		// Accelerators normally cannot be hot-plugged on OpenWrt, so cache the
		// scan result and only rescan an empty result once a minute.
		if(this.acceleratorCache !== null &&
			(this.acceleratorCache.length > 0 || Date.now() - this.acceleratorScanned < 60000))
			return Promise.resolve(this.acceleratorCache);

		this.acceleratorScanned = Date.now();

		return L.resolveDefault(fs.list('/sys/class/devfreq'), []).then(entries => {
			let probes = (entries || []).map(e => this.probeDevfreq(e.name));

			return Promise.all(probes);
		}).then(list => {
			let accs = (list || []).filter(a => a != null);

			// The rknpu driver implements get_dev_status() as a no-op, so its
			// devfreq "load" attribute is always 0; the debugfs node is the
			// only usable NPU load source on Rockchip SoCs.
			return this.probeFile('npu', 'rknpu',
				[ '/sys/kernel/debug/rknpu/load' ], 'rknpu').then(rknpu => {
				if(rknpu)
					accs = accs.filter(a => a.kind !== 'npu').concat(rknpu);

				let probes = [];

				if(!accs.some(a => a.kind === 'gpu'))
					probes.push(
						this.probeFile('gpu', 'kgsl',
							[ '/sys/class/kgsl/kgsl-3d0/gpu_busy_percentage',
							  '/sys/class/kgsl/kgsl-3d0/gpubusy' ], 'Adreno'),
						this.probeFile('gpu', 'amdgpu',
							[ '/sys/class/drm/card0/device/gpu_busy_percent' ], 'amdgpu'),
						this.probeFile('gpu', 'tegra',
							[ '/sys/devices/platform/gpu.0/load' ], 'Tegra')
					);

				if(!accs.some(a => a.kind === 'npu'))
					probes.push(this.probeAirohaNpu());

				return Promise.all(probes).then(extra => {
					let result = accs.concat(extra.filter(a => a != null));

					return this.probeMiscAccelerators().then(misc => {
						// A devfreq or vendor-specific entry already describes
						// this accelerator; the misc link would only duplicate it.
						misc.forEach(acc => {
							if(!result.some(a => a.kind === acc.kind))
								result.push(acc);
						});

						this.acceleratorCache = result;
						return result;
					});
				});
			});
		});
	},

	parseNumber(raw) {
		if(raw == null) return null;

		let match = String(raw).match(/-?\d+(?:\.\d+)?/);

		return match ? Number(match[0]) : null;
	},

	parsePercent(raw) {
		let value = this.parseNumber(raw);

		if(value == null || isNaN(value)) return null;

		return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
	},

	parseUtilization(raw) {
		if(raw == null) return null;

		let text = String(raw).trim();

		if(!text) return null;

		// Rockchip's devfreq load is "12@800000000Hz" and plain "NN %" is a
		// percentage already; neither must be mistaken for a busy/total pair.
		if(text.indexOf('@') >= 0 || text.indexOf('%') >= 0)
			return this.parsePercent(text);

		let values = text.match(/\d+(?:\.\d+)?/g);

		if(!values || !values.length) return null;

		// Some vendor counters publish "busy total" instead of a percentage.
		if(values.length >= 2) {
			let busy  = Number(values[0]),
			    total = Number(values[1]);

			if(isFinite(busy) && isFinite(total) && total > 0 && busy <= total)
				return Math.round(1000 * busy / total) / 10;
		}

		let value = Number(values[0]);

		if(!isFinite(value)) return null;

		// A few vendor kernels report per-mille (0..1000) instead of percent.
		if(value > 100 && value <= 1000) value = value / 10;

		// Anything larger is not a utilization value we can interpret.
		if(value > 100) return null;

		return Math.round(Math.max(0, value) * 10) / 10;
	},

	parseClock(raw) {
		let hz = this.parseNumber(raw);

		if(hz == null || hz <= 0) return null;

		// Mali's misc "clock" attribute reports MHz on most vendor kernels
		// (600, 800, ...), while devfreq-style attributes report Hz.
		if(hz <= 10000) hz *= 1000000;

		return this.formatFrequency(hz);
	},

	parseTegraLoad(raw) {
		let value = this.parseNumber(raw);

		if(value == null) return null;

		return Math.round(Math.max(0, Math.min(100, value / 10)) * 10) / 10;
	},

	parseKgslBusy(raw) {
		if(raw == null) return null;

		let parts = String(raw).trim().split(/\s+/);

		if(parts.length < 2) return null;

		let busy  = Number(parts[0]),
		    total = Number(parts[1]);

		if(isNaN(busy) || isNaN(total) || total <= 0) return null;

		return Math.round(1000 * busy / total) / 10;
	},

	parseRknpuLoad(raw) {
		if(raw == null) return null;

		let values = [], match = null;
		let re = /(\d+(?:\.\d+)?)\s*%/g;

		while((match = re.exec(String(raw))) != null)
			values.push(Number(match[1]));

		if(values.length == 0) return null;

		let average = values.reduce((a, b) => a + b, 0) / values.length;

		return Math.round(average * 10) / 10;
	},

	formatFrequency(raw) {
		let hz = this.parseNumber(raw);

		if(hz == null || hz <= 0) return null;

		if(hz >= 1000000) return Math.round(hz / 100000) / 10 + ' MHz';
		if(hz >= 1000) return Math.round(hz / 1000) + ' kHz';

		return hz + ' Hz';
	},

	readAccelerator(acc) {
		let finish = (load, frequency) => ({
			kind     : acc.kind,
			name     : acc.name,
			load     : load,
			frequency: frequency,
		});

		if(acc.source === 'devfreq') {
			return Promise.all([
				acc.loadPath ? L.resolveDefault(fs.read(acc.loadPath), null) : Promise.resolve(null),
				L.resolveDefault(fs.read(acc.path + '/cur_freq'), null),
			]).then(([rawLoad, rawFreq]) =>
				finish(this.parseUtilization(rawLoad), this.formatFrequency(rawFreq)));
		};

		if(acc.source === 'rknpu') {
			return L.resolveDefault(fs.read(acc.path), null)
				.then(raw => finish(this.parseRknpuLoad(raw), null));
		};

		if(acc.source === 'kgsl' && /gpubusy$/.test(acc.path)) {
			return L.resolveDefault(fs.read(acc.path), null)
				.then(raw => finish(this.parseKgslBusy(raw), null));
		};

		if(acc.source === 'tegra') {
			return L.resolveDefault(fs.read(acc.path), null)
				.then(raw => finish(this.parseTegraLoad(raw), null));
		};

		if(acc.source === 'misc') {
			return Promise.all([
				acc.path ? L.resolveDefault(fs.read(acc.path), null) : null,
				acc.freqPath ? L.resolveDefault(fs.read(acc.freqPath), null) : null,
			]).then(([rawLoad, rawFreq]) =>
				finish(this.parseUtilization(rawLoad),
				       rawFreq != null ? this.parseClock(rawFreq) : null));
		};

		if(acc.source === 'airoha') {
			return L.resolveDefault(fs.read(acc.path), null)
				.then(raw => finish(null, this.formatFrequency(raw)));
		};

		return L.resolveDefault(fs.read(acc.path), null)
			.then(raw => finish(this.parsePercent(raw), null));
	},

	loadAccelerators() {
		return this.discoverAccelerators()
			.then(accs => Promise.all(accs.map(a => this.readAccelerator(a))))
			.catch(() => []);
	},

	loadCpuFrequency() {
		let dir = '/sys/devices/system/cpu/cpu0/cpufreq';

		// cpufreq reports kHz. scaling_cur_freq is the rate the governor
		// selected, cpuinfo_cur_freq the rate the hardware reports.
		return Promise.all([
			L.resolveDefault(fs.read(dir + '/scaling_cur_freq'), null),
			L.resolveDefault(fs.read(dir + '/cpuinfo_cur_freq'), null),
		]).then(([scaling, cpuinfo]) => {
			let khz = this.parseNumber(scaling) || this.parseNumber(cpuinfo);

			if(khz > 0) return this.formatFrequency(khz * 1000);

			return this.readDefaultCpuFrequency();
		});
	},

	readDefaultCpuFrequency() {
		// Some kernels fail to register cpufreq-dt (the AN7581's CPU clock
		// has no rate), so there is no live frequency to read. The device
		// tree still describes the CPU operating points as opp-<Hz> nodes;
		// without a live value their maximum is the best available answer.
		return L.resolveDefault(
			fs.list('/sys/firmware/devicetree/base/opp-table'), []
		).then(entries => {
			let rates = (entries || []).map(e => {
				let match = /^opp-(\d+)$/.exec(e.name);

				return match ? Number(match[1]) : 0;
			}).filter(rate => rate > 0);

			return rates.length
				? this.formatFrequency(rates.reduce((a, b) => Math.max(a, b), 0))
				: null;
		});
	},

	allCPUs: {
		makeTable() {
			this.table = E('table', { 'class': 'table' });
		},
		append(cpuNum, cpuLoadObj, cpuLoadFlag) {
			if(cpuNum == Infinity) {
				this.table.append(
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'width': '33%' },
							_('Total load')),
						E('td', { 'class': 'td' },
							E('div', {
									'class': 'cbi-progressbar',
									'title': (cpuLoadFlag) ?
										cpuLoadObj.loadAvg + '%' :
										_('Calculating') + '...',
								},
								E('div', { 'style': 'width:' + cpuLoadObj.loadAvg + '%' })
							)
						),
					])
				);
			};
		},
	},

	allCPUsDetail: {
		cpuTableTitles: [
			_('All CPUs'),
			_('Load'),
			'user %',
			'nice %',
			'system %',
			'idle %',
			'iowait %',
			'irq %',
			'softirq %',
		],
		makeTable() {
			this.table = E('table', { 'class': 'table' },
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th left' }, this.cpuTableTitles[0]),
					E('th', { 'class': 'th left' }, this.cpuTableTitles[1]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[2]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[3]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[4]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[5]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[6]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[7]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[8]),
				])
			);
		},
		append(cpuNum, cpuLoadObj, cpuLoadFlag) {
			if(cpuNum == Infinity) {
				this.table.append(
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'data-title': this.cpuTableTitles[0] },
							_('Total load')),
						E('td', { 'class': 'td left', 'data-title': this.cpuTableTitles[1] },
							E('div', {
									'class': 'cbi-progressbar',
									'title': (cpuLoadFlag) ?
										cpuLoadObj.loadAvg + '%' :
										_('Calculating') + '...',
									'style': 'min-width:8em !important',
								},
								E('div', { 'style': 'width:' + cpuLoadObj.loadAvg + '%' })
							)
						),
						E('td', { 'class': 'td center',
							'data-title': this.cpuTableTitles[2] }, cpuLoadObj.loadUser),
						E('td', { 'class': 'td center',
							'data-title': this.cpuTableTitles[3] }, cpuLoadObj.loadNice),
						E('td', { 'class': 'td center',
							'data-title': this.cpuTableTitles[4] }, cpuLoadObj.loadSys),
						E('td', { 'class': 'td center',
							'data-title': this.cpuTableTitles[5] }, cpuLoadObj.loadIdle),
						E('td', { 'class': 'td center',
							'data-title': this.cpuTableTitles[6] }, cpuLoadObj.loadIo),
						E('td', { 'class': 'td center',
							'data-title': this.cpuTableTitles[7] }, cpuLoadObj.loadIrq),
						E('td', { 'class': 'td center',
							'data-title': this.cpuTableTitles[8] }, cpuLoadObj.loadSirq),
					])
				);
			};
		},
	},

	eachCPU: {
		makeTable() {
			this.table = E('table', { 'class': 'table' });
		},
		append(cpuNum, cpuLoadObj, cpuLoadFlag) {
			this.table.append(
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left', 'width': '33%' },
						(cpuNum == Infinity) ? _('Total load') : _('CPU') + ' ' + cpuNum),
					E('td', { 'class': 'td' },
						E('div', {
								'class': 'cbi-progressbar',
								'title': (cpuLoadFlag) ?
									cpuLoadObj.loadAvg + '%' :
									_('Calculating') + '...',
							},
							E('div', { 'style': 'width:' + cpuLoadObj.loadAvg + '%' })
						)
					),
				])
			);
		},
	},

	eachCPUDetail: {
		cpuTableTitles: [
			_('CPU'),
			_('Load'),
			'user %',
			'nice %',
			'system %',
			'idle %',
			'iowait %',
			'irq %',
			'softirq %',
		],
		makeTable() {
			this.table = E('table', { 'class': 'table' },
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th left' }, this.cpuTableTitles[0]),
					E('th', { 'class': 'th left' }, this.cpuTableTitles[1]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[2]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[3]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[4]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[5]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[6]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[7]),
					E('th', { 'class': 'th center' }, this.cpuTableTitles[8]),
				])
			);
		},
		append(cpuNum, cpuLoadObj, cpuLoadFlag) {
			this.table.append(
				E('tr', { 'class': 'tr' }, [
					E('td', { 'class': 'td left', 'data-title': this.cpuTableTitles[0] },
						(cpuNum == Infinity) ? _('Total load') : _('CPU') + ' ' + cpuNum),
					E('td', { 'class': 'td left', 'data-title': this.cpuTableTitles[1] },
						E('div', {
								'class': 'cbi-progressbar',
								'title': (cpuLoadFlag) ?
									cpuLoadObj.loadAvg + '%' :
									_('Calculating') + '...',
								'style': 'min-width:8em !important',
							},
							E('div', { 'style': 'width:' + cpuLoadObj.loadAvg + '%' })
						)
					),
					E('td', { 'class': 'td center',
						'data-title': this.cpuTableTitles[2] }, cpuLoadObj.loadUser),
					E('td', { 'class': 'td center',
						'data-title': this.cpuTableTitles[3] }, cpuLoadObj.loadNice),
					E('td', { 'class': 'td center',
						'data-title': this.cpuTableTitles[4] }, cpuLoadObj.loadSys),
					E('td', { 'class': 'td center',
						'data-title': this.cpuTableTitles[5] }, cpuLoadObj.loadIdle),
					E('td', { 'class': 'td center',
						'data-title': this.cpuTableTitles[6] }, cpuLoadObj.loadIo),
					E('td', { 'class': 'td center',
						'data-title': this.cpuTableTitles[7] }, cpuLoadObj.loadIrq),
					E('td', { 'class': 'td center',
						'data-title': this.cpuTableTitles[8] }, cpuLoadObj.loadSirq),
				])
			);
		},
	},

	makeCPUTable(cpuLoadArray) {
		let currentView = (this.availableViewModes[this.viewMode] !== undefined) ?
			this[this.availableViewModes[this.viewMode][0]] :
			this[this.availableViewModes[0][0]];
		currentView.makeTable();
		cpuLoadArray.forEach((c, i) => {
			currentView.append(c.cpuNum, c, (this.lastStatArray !== null));
		});
		return currentView.table;
	},

	makeAcceleratorTable(accelerators, cpuFrequency) {
		let rows = [];

		if(cpuFrequency) {
			// Shares the accelerator table so the CPU row sits above the
			// GPU/NPU rows and their cells line up.
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' },
					_('CPU Frequency')),
				E('td', { 'class': 'td' },
					E('div', { 'class': 'corestatus-detail' }, cpuFrequency)),
			]));
		}

		if(accelerators && accelerators.length) {
			rows = rows.concat(this.makeAcceleratorRows(accelerators));
		}

		if(rows.length == 0) return null;

		return E('table', { 'class': 'table corestatus-table' }, rows);
	},

	makeAcceleratorRows(accelerators) {
		let totals = {}, indices = {};

		accelerators.forEach(acc => {
			totals[acc.kind] = (totals[acc.kind] || 0) + 1;
		});

		return accelerators.map(acc => {
			indices[acc.kind] = (indices[acc.kind] || 0) + 1;

			let load     = (acc.load != null) ? acc.load : null;
			let hasFreq  = !!acc.frequency;
			let single   = (totals[acc.kind] <= 1);
			let kindName = (acc.kind === 'gpu') ? _('GPU') : _('NPU');
			let label;

			// Without a load counter only the frequency is shown, so naming
			// the row "Load" would misdescribe it.
			if(load != null)
				label = single
					? ((acc.kind === 'gpu') ? _('GPU Load') : _('NPU Load'))
					: '%s %d %s'.format(kindName, indices[acc.kind], _('Load'));
			else if(hasFreq)
				label = single
					? ((acc.kind === 'gpu') ? _('GPU Frequency') : _('NPU Frequency'))
					: '%s %d %s'.format(kindName, indices[acc.kind], _('Frequency'));
			else
				label = single
					? kindName
					: '%s %d'.format(kindName, indices[acc.kind]);

			// A frequency-only row is already labelled "NPU Frequency", so the
			// frequency alone says it all. The device name is only needed to
			// tell apart several accelerators of the same kind.
			let details = (load == null && hasFreq && single)
				? acc.frequency
				: [ acc.name, acc.frequency ].filter(v => v).join(' · ');
			let contents = [];

			// Hardware without a load counter (e.g. the Airoha packet-offload
			// NPU) has nothing to plot; an empty bar with "N/A" only adds
			// noise, so such rows show their details instead.
			if(load != null)
				contents.push(E('div', {
					'class': 'cbi-progressbar',
					'title': load + '%',
				}, E('div', { 'style': 'width:' + load + '%' })));

			if(details)
				contents.push(E('div', { 'class': 'corestatus-detail' }, details));

			return E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' }, label),
				E('td', { 'class': 'td' }, contents),
			]);
		});
	},

	load() {
		this.restoreSettingsFromLocalStorage();

		return Promise.all([
			L.resolveDefault(fs.read('/proc/stat'), null),
			this.loadAccelerators(),
			temperatureOverview.load(),
			this.loadCpuFrequency(),
		]).then(results => ({
			cpuData      : results[0],
			accelerators : results[1] || [],
			temperature  : results[2],
			cpuFrequency : results[3],
		}));
	},

	render(data) {
		let cpuData      = data ? data.cpuData : null;
		let accelerators = (data && data.accelerators) ? data.accelerators : [];
		let cpuFrequency = (data && data.cpuFrequency) ? data.cpuFrequency : null;

		if(!cpuData) return;

		let temperatureContents = temperatureOverview.render(
			data ? data.temperature : null);

		let cpuStatArray = this.parseProcData(cpuData);

		// For single-core CPU
		if(cpuStatArray.length == 2) {
			cpuStatArray = cpuStatArray.slice(1, 2);
			delete this.availableViewModes[2];
			delete this.availableViewModes[3];
			if(this.viewMode > 1) this.viewMode = 0;
		};

		let cpuLoadArray = this.calcCPULoad(cpuStatArray);
		let cpuTable = this.makeCPUTable(cpuLoadArray);
		let acceleratorTable = this.makeAcceleratorTable(accelerators, cpuFrequency);

		let viewModeSelectFunc = value => {
			this.saveSettingsToLocalStorage(value);
			this.viewMode = value;
			viewModeEntries.forEach(i => {
				i.classList.remove('corestatus-view-mode-entry-checked');
			});
			viewModeEntries[value].classList.add('corestatus-view-mode-entry-checked');
			let newTable = this.makeCPUTable(cpuLoadArray);
			cpuTable.replaceWith(newTable);
			cpuTable = newTable;
		};

		let viewModeSelectOnClick = ev => {
			viewModeSelectFunc(ev.target.dataset.value);
			ev.target.blur();
		};

		let viewModeEntries = [];

		for(let [i, v] of Object.entries(this.availableViewModes)) {
			viewModeEntries.push(
				E('span', {
					'class'     : 'corestatus-view-mode-entry',
					'data-value': i,
					'click'     : viewModeSelectOnClick,
				}, v[1])
			);
		};

		viewModeSelectFunc(this.viewMode);

		this.lastStatArray = cpuStatArray;

		let contents = [
			E('h4', { 'class': 'corestatus-load-title' }, _('Load')),
			E('div', { 'class': 'corestatus-view-modes' },
				viewModeEntries
			),
			cpuTable,
		];

		if(acceleratorTable)
			contents.push(acceleratorTable);

		if(temperatureContents)
			contents.push(E('div', { 'class': 'corestatus-temperature' }, [
				E('h4', {}, _('Temperature')),
				temperatureContents,
			]));

		return E('div', { 'class': 'cbi-section' }, contents);
	},
});
