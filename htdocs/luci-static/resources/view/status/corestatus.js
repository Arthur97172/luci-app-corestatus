'use strict';
'require poll';
'require view';
'require corestatus.load-graph as loadGraph';
'require corestatus.temperature-graph as temperatureGraph';

document.head.append(E('style', {'type': 'text/css'},
`
.corestatus-page-switch {
	margin: 0 0 .5em;
	padding: 0 var(--section-inset, 0.625rem);
}
.corestatus-page-switch-entry {
	display: inline-block;
	cursor: pointer;
	margin: 2px 4px 2px 0 !important;
	padding: 3px 10px;
	border: 1px solid var(--border-color-medium, var(--border-color, rgba(128, 128, 128, 0.4)));
	-webkit-border-radius: 4px;
	-moz-border-radius: 4px;
	border-radius: 4px;
	opacity: 0.7;
	background-color: var(--background-color-low, var(--surface-muted, rgba(128, 128, 128, 0.12)));
	color: inherit;
}
.corestatus-page-switch-entry:hover {
	opacity: 0.9;
}
.corestatus-page-switch-entry:active {
	opacity: 1.0;
}
.corestatus-page-switch-entry-checked {
	border-color: var(--primary-color-high, var(--primary, #1976d2));
	color: var(--primary-color-high, var(--primary, #1976d2));
	opacity: 1.0;
}
`));

return view.extend({
	pollInterval: 3,

	viewName    : 'corestatus-page',

	activePage  : 'load',

	restoreSettings() {
		let page = localStorage.getItem(`luci-app-${this.viewName}-view`);
		if(page === 'load' || page === 'temperature')
			this.activePage = page;
	},

	load() {
		this.restoreSettings();

		return Promise.all([
			loadGraph.load(),
			temperatureGraph.load(),
		]);
	},

	render(data) {
		let loadPane = loadGraph.render(data[0]);
		let tempPane = temperatureGraph.render(data[1]);
		let loadWrap = E('div', {'class': 'corestatus-page-pane', 'data-pane': 'load'},
			loadPane || '');
		let tempWrap = E('div', {'class': 'corestatus-page-pane', 'data-pane': 'temperature'},
			tempPane || '');
		let entries  = {};

		let selectPage = page => {
			this.activePage = page;
			localStorage.setItem(`luci-app-${this.viewName}-view`, page);

			for(let [name, entry] of Object.entries(entries))
				entry.classList.toggle('corestatus-page-switch-entry-checked', name === page);

			loadWrap.style.display = (page === 'load') ? '' : 'none';
			tempWrap.style.display = (page === 'temperature') ? '' : 'none';
		};

		let makeEntry = (name, title) => (entries[name] = E('span', {
			'class': 'corestatus-page-switch-entry',
			'click': ev => {
				selectPage(name);
				ev.target.blur();
			},
		}, title));

		let switchBar = E('div', {'class': 'corestatus-page-switch'}, [
			makeEntry('load', _('Load')),
			makeEntry('temperature', _('Temperature')),
		]);

		selectPage(this.activePage);

		poll.add(L.bind(function() {
			return Promise.all([
				loadGraph.pollOnce(),
				temperatureGraph.pollOnce(),
			]);
		}, this), this.pollInterval);

		return E([], [
			E('h2', _('Load and Temperature')),
			E('div', {'class': 'cbi-map-descr'},
				_('This page displays CPU load and temperature sensor data at %d second interval.')
					.format(this.pollInterval)),
			E('div', {'class': 'corestatus-page-body'}, [
				switchBar,
				loadWrap,
				tempWrap,
			]),
		]);
	},

	handleSaveApply: null,
	handleSave     : null,
	handleReset    : null,
});
