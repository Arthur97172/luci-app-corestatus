'use strict';
'require baseclass';
'require rpc';

document.head.append(E('style', {'type': 'text/css'},
`
:root {
	--app-corestatus-font-color: #2e2e2e;
	--app-corestatus-border-color: var(--border-color-medium, #d4d4d4);
	--app-corestatus-hot-color: #fff7e2;
	--app-corestatus-overheat-color: #ffe9e8;
}
:root[data-darkmode="true"] {
	--app-corestatus-font-color: #fff;
	--app-corestatus-border-color: var(--border-color-medium, #444);
	--app-corestatus-hot-color: #8d7000;
	--app-corestatus-overheat-color: #a93734;
}
:root {
	/* light: same colors as the zone strips of the Port status cards (Argon variables, with fallbacks) */
	--app-corestatus-ok: rgb(var(--zone-positive-rgb, 144, 240, 144));
	--app-corestatus-warn: rgb(240, 208, 144);
	--app-corestatus-crit: rgb(var(--zone-negative-rgb, 240, 144, 144));
	--app-corestatus-crit-text: var(--zone-label-color, #333);
}
/* dark: Argon's zone colors are too dim for a thermometer / gauge, use brighter tones */
:root[data-argon-mode="dark"] {
	--app-corestatus-ok: rgb(88, 168, 88);
	--app-corestatus-warn: rgb(235, 184, 64);
	--app-corestatus-crit: rgb(232, 106, 106);
	--app-corestatus-crit-text: #fff;
}
@media (prefers-color-scheme: dark) {
	:root:not([data-argon-mode="light"]) {
		--app-corestatus-ok: rgb(88, 168, 88);
		--app-corestatus-warn: rgb(235, 184, 64);
		--app-corestatus-crit: rgb(232, 106, 106);
		--app-corestatus-crit-text: #fff;
	}
}
.corestatus-hot {
	background-color: var(--app-corestatus-hot-color) !important;
	color: var(--app-corestatus-font-color) !important;
}
.corestatus-hot .td {
	color: var(--app-corestatus-font-color) !important;
}
.corestatus-hot td {
	color: var(--app-corestatus-font-color) !important;
}
.corestatus-overheat {
	background-color: var(--app-corestatus-overheat-color) !important;
	color: var(--app-corestatus-font-color) !important;
}
.corestatus-overheat .td {
	color: var(--app-corestatus-font-color) !important;
}
.corestatus-overheat td {
	color: var(--app-corestatus-font-color) !important;
}

.corestatus-temp-area {
	width: 100%;
	padding: 0 var(--section-inset, 0.625rem) 1em;
	display: flex;
	-webkit-align-items: flex-start;
	align-items: flex-start;
	-webkit-justify-content: left;
	justify-content: left;
	-webkit-flex-wrap: wrap;
	flex-wrap: wrap;
	-webkit-flex-direction: row;
	flex-direction: row;
}
.corestatus-list-item {
	display: inline-block;
	flex-grow: 0;
	-webkit-flex-grow 0;
	flex-shrink: 1;
	-webkit-flex-shrink 1;
	width: 29em;
	word-wrap: break-word;
	margin: 0px 4px 8px 0 !important;
	padding: 4px;
	border: 1px solid transparent;
	border-color: var(--app-corestatus-border-color);
	-webkit-border-radius: 4px;
	-moz-border-radius: 4px;
	border-radius: 4px;
}
.corestatus-temp-value {
	display: inline-block;
	margin-left: 0.5em !important;
	width: 4em;
	text-align: left;
}
.corestatus-sensor-name {
	display: inline-block;
	padding-left: 1.5em;
	font-size: 95%;
}

/* card view: same structure as the Port status cards (.ifacebox) */
/* cards start at the left inset, on the same line as the table's content */
.corestatus-card-area {
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-start;
	gap: calc(var(--field-gap, .75rem) + 2rem);
	padding: .25rem var(--section-inset, .25em) var(--field-gap, .5rem);
}

.corestatus-card.ifacebox {
	display: flex;
	flex: 0 0 5.625rem;
	flex-direction: column;
	width: 5.625rem;
	min-width: 0;
	max-width: 100%;
	margin: 0;
	overflow: hidden;
	text-align: center;
}

.corestatus-card .corestatus-card-head {
	position: relative;
	padding: .2em .5em;
	font-size: .75rem;
	line-height: 1.25;
}
/* Bootstrap keeps .ifacebox-head at a hard-coded #eee in dark mode while the
   inherited text turns light, so the head needs a dark background there.
   Argon themes style the head themselves and never set data-darkmode. */
:root[data-darkmode="true"] .corestatus-card:not(.corestatus-card-overheat) .corestatus-card-head {
	background: var(--background-color-low, #555);
}
/* one line only, so the values of cards in the same row stay aligned.
   The ellipsis lives on an inner element that ignores the pointer: Safari shows a native tooltip
   for any hovered element that is cut off with an ellipsis. */
.corestatus-card .corestatus-card-name {
	display: block;
	font-weight: bold;
}
.corestatus-card .corestatus-card-name-text {
	display: block;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	pointer-events: none;
}
.corestatus-card .corestatus-card-main {
	flex: 1 1 auto;
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: .25rem;
	padding: .4rem .375rem;
	line-height: 1;
}
.corestatus-card-value {
	font-size: 11px;
	font-variant-numeric: tabular-nums;
	white-space: nowrap;
}

/* thermometer icon, plays the role of the port icon in the Port status cards */
.corestatus-icon {
	display: block;
	width: 12px;
	height: 24px;
}
.corestatus-icon .tube {
	fill: none;
	stroke: currentColor;
	stroke-width: 1.5;
	opacity: .5;
}
.corestatus-icon .mercury {
	fill: var(--temp-color, var(--app-corestatus-ok));
}
.corestatus-card-nodata .corestatus-icon .mercury {
	fill: currentColor;
	opacity: .25;
}

/* 3px gauge strip, like the zone strip between the two halves of a port card */
.corestatus-gauge {
	flex: none;
	height: 3px;
	background: var(--iface-head-bg, rgba(128, 128, 128, .25));
}
.corestatus-gauge::before {
	content: '';
	display: block;
	height: 100%;
	width: var(--temp-ratio, 0%);
	background: var(--temp-color, var(--app-corestatus-ok));
	transition: width .6s ease;
}

.corestatus-card .corestatus-card-info {
	display: flex;
	flex-wrap: nowrap;
	align-items: center;
	justify-content: space-between;
	gap: .25rem;
	padding: .3rem;
	font-size: 80%;
	line-height: 1.3;
	white-space: nowrap;
}
.corestatus-info-label {
	font-size: 80%;
	text-transform: uppercase;
	opacity: .7;
}
.corestatus-info-value {
	margin-inline-start: auto;
	font-variant-numeric: tabular-nums;
}

.corestatus-card-hot { --temp-color: var(--app-corestatus-warn); }
.corestatus-card-overheat { --temp-color: var(--app-corestatus-crit); }
.corestatus-card-hot .corestatus-card-value,
.corestatus-card-overheat .corestatus-card-value {
	color: var(--temp-color);
	color: color-mix(in srgb, var(--temp-color) 55%, var(--iface-head-text, var(--text-color-highest, #000)));
}
.corestatus-card-overheat .corestatus-card-head {
	background: var(--app-corestatus-crit);
	color: var(--app-corestatus-crit-text);
}

#corestatus-buttons-wrapper {
	margin: 0 var(--section-inset, 0.625rem) .5rem;
	padding: .25rem 0 0;
}
`));

return baseclass.extend({
	title          : _('Temperature'),

	viewName       : 'corestatus',

	tempHot        : 95,

	tempOverheat   : 105,

	sensorsData    : null,

	tempData       : null,

	sensorsPath    : [],

	tempTable      : E('table', { 'class': 'table' }),

	tempBar        : E('table', { 'class': 'table' }),

	tempArea       : E('div', { 'class': 'corestatus-temp-area' }),

	tempCard       : E('div', { 'class': 'corestatus-card-area' }),

	tempView       : E('div', {}),

	viewType       : 'card',

	callSensors : rpc.declare({
		object: 'luci.corestatus',
		method: 'getSensors',
		expect: { '': {} },
	}),

	callTempData: rpc.declare({
		object: 'luci.corestatus',
		method: 'getTempData',
		params: [ 'tpaths' ],
		expect: { '': {} },
	}),

	formatTemp(mc) {
		return Number((mc / 1000).toFixed(1));
	},

	sortFunc(a, b) {
		return (a.number > b.number) ? 1 : (a.number < b.number) ? -1 : 0;
	},

	// "cpu0_thermal" -> "cpu0"
	shortSensorName(sensor) {
		let s = String(sensor).replace(/[_ -]?thermal$/i, '');
		return (s.length > 0) ? s : String(sensor);
	},

	limitLabels: { max: 'max', critical: 'crit', emergency: 'emerg' },

	// Thermometer icon built with the DOM API (E() would treat a markup string inside an array as plain text).
	// The mercury color comes from --temp-color (see CSS).
	makeThermoIcon() {
		const ns = 'http://www.w3.org/2000/svg';
		const mk = (tag, attrs) => {
			const el = document.createElementNS(ns, tag);
			for(const k in attrs) el.setAttribute(k, attrs[k]);
			return el;
		};
		const svg = mk('svg', { 'class': 'corestatus-icon', 'viewBox': '0 0 14 28', 'aria-hidden': 'true' });
		svg.append(
			mk('path', { 'class': 'tube', 'd': 'M4.5 4.5a2.5 2.5 0 0 1 5 0v13.2a5 5 0 1 1-5 0z' }),
			mk('circle', { 'class': 'mercury', 'cx': '7', 'cy': '22', 'r': '2.8' }),
			mk('rect', { 'class': 'mercury', 'x': '6', 'y': '9', 'width': '2', 'height': '13', 'rx': '1' })
		);
		return svg;
	},

	restoreSettingsFromLocalStorage() {
		let view = localStorage.getItem(`luci-app-${this.viewName}-view`);
		if([ 'card', 'list', 'table', 'bar' ].indexOf(view) >= 0) {
			this.viewType = view;
		};
	},

	saveSettingsToLocalStorage() {
		localStorage.setItem(
			`luci-app-${this.viewName}-view`, this.viewType);
	},

	makeTempTableContent() {
		this.tempTable.innerHTML = '';
		this.tempTable.append(
				E('tr', { 'class': 'tr table-titles' }, [
					E('th', { 'class': 'th left', 'width': '33%' }, _('Sensor')),
					E('th', { 'class': 'th left' }, _('Temperature')),
				])
			);

		if(this.sensorsData && this.tempData) {
			for(let [k, v] of Object.entries(this.sensorsData)) {
				v.sort(this.sortFunc);

				for(let i of Object.values(v)) {
					let sensor = i.title || i.item;

					if(i.sources === undefined) {
						continue;
					};

					i.sources.sort(this.sortFunc);

					for(let j of i.sources) {
						let temp = this.tempData[j.path];
						let name = (j.label !== undefined) ? sensor + " / " + j.label :
							(j.item !== undefined) ? sensor + " / " + j.item.replace(/_input$/, "") : sensor

						if(temp !== undefined && temp !== null) {
							temp = this.formatTemp(temp);
						};

						let tempHot       = NaN;
						let tempOverheat  = NaN;
						let tpoints       = j.tpoints;

						if(tpoints) {
							for(let i of Object.values(tpoints)) {
								let t = this.formatTemp(i.temp);

								if(i.type == 'max' || i.type == 'critical' || i.type == 'emergency') {
									if(!(tempOverheat <= t)) {
										tempOverheat = t;
									};
								}
								else if(i.type == 'hot') {
									tempHot = t;
								};
							};
						};

						if(isNaN(tempHot) && isNaN(tempOverheat)) {
							tempHot      = this.tempHot;
							tempOverheat = this.tempOverheat;
						};

						let rowStyle = (temp >= tempOverheat) ? ' corestatus-overheat':
							(temp >= tempHot) ? ' corestatus-hot' : '';

						this.tempTable.append(
							E('tr', {
								'class'    : 'tr' + rowStyle,
								'data-path': j.path ,
							}, [
								E('td', {
										'class'     : 'td left',
										'data-title': _('Sensor')
									},
									name
								),
								E('td', {
										'class'     : 'td left',
										'data-title': _('Temperature')
									},
									(temp === undefined || temp === null) ? '-' : temp + ' °C'
								),
							])
						);
					};
				};
			};
		};

		if(this.tempTable.childNodes.length == 1) {
			this.tempTable.append(
				E('tr', { 'class': 'tr placeholder' },
					E('td', { 'class': 'td' },
						E('em', {}, _('No temperature sensors available'))
					)
				)
			);
		};

		return this.tempTable;
	},

	makeTempAreaContent() {
		this.tempArea.innerHTML = '';

		for(let [k, v] of Object.entries(this.sensorsData)) {
			v.sort(this.sortFunc);

			for(let i of Object.values(v)) {
				let sensor = i.title || i.item;

				if(i.sources === undefined) {
					continue;
				};

				i.sources.sort(this.sortFunc);

				for(let j of i.sources) {
					let temp = this.tempData[j.path];
					let name = (j.label !== undefined) ? sensor + " / " + j.label :
						(j.item !== undefined) ? sensor + " / " + j.item.replace(/_input$/, "") : sensor

					if(temp !== undefined && temp !== null) {
						temp = this.formatTemp(temp);
					};

					let tempHot       = NaN;
					let tempOverheat  = NaN;
					let tpoints       = j.tpoints;

					if(tpoints) {
						for(let i of Object.values(tpoints)) {
							let t = this.formatTemp(i.temp);

							if(i.type == 'max' || i.type == 'critical' || i.type == 'emergency') {
								if(!(tempOverheat <= t)) {
									tempOverheat = t;
								};
							}
							else if(i.type == 'hot') {
								tempHot = t;
							};
						};
					};

					if(isNaN(tempHot) && isNaN(tempOverheat)) {
						tempHot      = this.tempHot;
						tempOverheat = this.tempOverheat;
					};

					let itemStyle = (temp >= tempOverheat) ? ' corestatus-overheat':
						(temp >= tempHot) ? ' corestatus-hot' : '';

					this.tempArea.append(
						E('div', { 'class': 'corestatus-list-item' + itemStyle }, [
							E('span', {
								'class': 'corestatus-temp-value',
							}, (temp === undefined || temp === null) ? '-' : temp + ' °C'),
							E('span', {
								'class': 'corestatus-sensor-name'
							}, name),
						])
					);
				};
			};
		};

		if(this.tempArea.childNodes.length == 0) {
			this.tempArea.append(
				E('em', {}, _('No temperature sensors available'))
			);
		};

		return this.tempArea;
	},

	makeTempBarContent() {
		this.tempBar.innerHTML = '';

		if(this.sensorsData && this.tempData) {
			for(let [k, v] of Object.entries(this.sensorsData)) {
				v.sort(this.sortFunc);

				for(let i of Object.values(v)) {
					let sensor = i.title || i.item;

					if(i.sources === undefined) {
						continue;
					};

					i.sources.sort(this.sortFunc);

					for(let j of i.sources) {
						let temp = this.tempData[j.path];
						let name = (j.label !== undefined) ? sensor + " / " + j.label :
							(j.item !== undefined) ? sensor + " / " + j.item.replace(/_input$/, "") : sensor

						if(temp !== undefined && temp !== null) {
							temp = this.formatTemp(temp);
						};

						let tempHot       = NaN;
						let tempOverheat  = NaN;
						let tpoints       = j.tpoints;

						if(tpoints) {
							for(let i of Object.values(tpoints)) {
								let t = this.formatTemp(i.temp);

								if(i.type == 'max' || i.type == 'critical' || i.type == 'emergency') {
									if(!(tempOverheat <= t)) {
										tempOverheat = t;
									};
								}
								else if(i.type == 'hot') {
									tempHot = t;
								};
							};
						};

						if(isNaN(tempHot) && isNaN(tempOverheat)) {
							tempHot      = this.tempHot;
							tempOverheat = this.tempOverheat;
						};

						let rowStyle = (temp >= tempOverheat) ? ' corestatus-overheat':
							(temp >= tempHot) ? ' corestatus-hot' : '';
						let hasTemp  = (temp !== undefined && temp !== null);
						let ratio    = hasTemp ? Math.min(Math.max(temp / tempOverheat, 0), 1) * 100 : 0;

						this.tempBar.append(
							E('tr', {
								'class'    : 'tr' + rowStyle,
								'data-path': j.path,
							}, [
								E('td', {
										'class'     : 'td left',
										'width'     : '33%',
										'data-title': _('Sensor')
									},
									name
								),
								E('td', {
										'class'     : 'td left',
										'data-title': _('Temperature')
									},
									E('div', {
											'class': 'cbi-progressbar',
											'title': hasTemp ? temp + ' °C' : '-',
										},
										E('div', { 'style': 'width:' + ratio + '%' })
									)
								),
							])
						);
					};
				};
			};
		};

		if(this.tempBar.childNodes.length == 0) {
			this.tempBar.append(
				E('tr', { 'class': 'tr placeholder' },
					E('td', { 'class': 'td' },
						E('em', {}, _('No temperature sensors available'))
					)
				)
			);
		};

		return this.tempBar;
	},

	makeTempCardContent() {
		this.tempCard.innerHTML = '';

		for(let [k, v] of Object.entries(this.sensorsData)) {
			v.sort(this.sortFunc);

			for(let i of Object.values(v)) {
				let sensor = i.title || i.item;

				if(i.sources === undefined) {
					continue;
				};

				i.sources.sort(this.sortFunc);

				for(let j of i.sources) {
					let temp = this.tempData[j.path];
					let suffix = (j.label !== undefined) ? " / " + j.label :
						(j.item !== undefined) ? " / " + j.item.replace(/_input$/, "") : "";
					// on a card, a lone unlabeled "tempN" source adds nothing to the device name
					let genericSuffix = (j.label === undefined && /^temp[0-9]+_input$/.test(j.item || '') &&
						i.sources.length === 1);
					let shortName = this.shortSensorName(sensor) + (genericSuffix ? '' : suffix);

					if(temp !== undefined && temp !== null) {
						temp = this.formatTemp(temp);
					};

					let tempHot       = NaN;
					let tempOverheat  = NaN;
					let overType      = null;
					let tpoints       = j.tpoints;

					if(tpoints) {
						for(let i of Object.values(tpoints)) {
							let t = this.formatTemp(i.temp);
							if(t <= 0 || t > 200) {
								continue;
							};

							if(i.type == 'max' || i.type == 'critical' || i.type == 'emergency') {
								if(!(tempOverheat <= t)) {
									tempOverheat = t;
									overType     = i.type;
								};
							}
							else if(i.type == 'hot') {
								tempHot = t;
							};
						};
					};

					if(isNaN(tempHot) && isNaN(tempOverheat)) {
						tempHot      = this.tempHot;
						tempOverheat = this.tempOverheat;
					};

					let hasTemp = (temp !== undefined && temp !== null);
					let state   = (temp >= tempOverheat) ? ' corestatus-card-overheat' :
						(temp >= tempHot) ? ' corestatus-card-hot' : '';
					let ratio   = hasTemp ? Math.min(Math.max(temp / tempOverheat, 0), 1) * 100 : 0;
					let limitType = overType || 'max';

					let infoAttrs = { 'class': 'ifacebox-body corestatus-card-info' };

					this.tempCard.append(
						E('div', {
							'class': 'ifacebox corestatus-card' + state + (hasTemp ? '' : ' corestatus-card-nodata'),
							'style': `--temp-ratio: ${ratio}%;`,
						}, [
							E('div', { 'class': 'ifacebox-head corestatus-card-head' }, [
								E('span', { 'class': 'corestatus-card-name' },
									E('span', { 'class': 'corestatus-card-name-text' }, document.createTextNode(shortName))),
							]),
							E('div', { 'class': 'ifacebox-body corestatus-card-main' }, [
								this.makeThermoIcon(),
								E('span', { 'class': 'corestatus-card-value' },
									hasTemp ? temp.toFixed(1) + ' °C' : '-'),
							]),
							E('div', { 'class': 'corestatus-gauge' }),
							E('div', infoAttrs, [
								E('span', { 'class': 'corestatus-info-label' }, this.limitLabels[limitType] || limitType),
								E('span', { 'class': 'corestatus-info-value' }, `${tempOverheat} °C`),
							]),
						])
					);
				};
			};
		};

		if(this.tempCard.childNodes.length == 0) {
			this.tempCard.append(
				E('em', {}, _('No temperature sensors available'))
			);
		};

		return this.tempCard;
	},

	makeViewContent() {
		this.tempView.innerHTML = '';
		this.tempView.append(
			(this.viewType == 'card') ? this.makeTempCardContent() :
			(this.viewType == 'list') ? this.makeTempAreaContent() :
			(this.viewType == 'bar') ? this.makeTempBarContent() : this.makeTempTableContent());
	},

	setViewType(viewType) {
		if(this.viewType == viewType) {
			return;
		};

		this.viewType = viewType;
		this.saveSettingsToLocalStorage();
		this.makeViewContent();

		for(let [name, entry] of Object.entries(this.viewEntries || {})) {
			entry.classList.toggle('corestatus-view-mode-entry-checked', name == viewType);
		};
	},

	load() {
		this.restoreSettingsFromLocalStorage();
		if(this.sensorsData) {
			return (this.sensorsPath.length > 0) ?
				L.resolveDefault(this.callTempData(this.sensorsPath), null) :
					Promise.resolve(null);
		} else {
			return L.resolveDefault(this.callSensors(), null);
		};
	},

	render(data) {
		if(data) {
			if(!this.sensorsData) {
				this.sensorsData = data.sensors;
				this.sensorsPath = data.temp && new Array(...Object.keys(data.temp));
			};
			this.tempData = data.temp;
		};

		if(!this.sensorsData || !this.tempData) {
			return;
		};

		this.makeViewContent();

		let viewEntries = {};
		let makeViewEntry = (name, title) => viewEntries[name] = E('span', {
			'class': 'corestatus-view-mode-entry' +
				((name == this.viewType) ? ' corestatus-view-mode-entry-checked' : ''),
			'click': () => this.setViewType(name),
		}, title);

		this.viewEntries = viewEntries;

		return E('div', { 'class': 'corestatus-overview' }, [
			E('div', { 'id': 'corestatus-buttons-wrapper' }, [
				makeViewEntry('card', _('Card view')),
				makeViewEntry('list', _('List view')),
				makeViewEntry('table', _('Table view')),
				makeViewEntry('bar', _('Bar view')),
			]),
			this.tempView,
		]);
	},
});
