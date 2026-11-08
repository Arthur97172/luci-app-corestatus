'use strict';
'require baseclass';

document.head.append(E('style', {'type': 'text/css'},
`
.corestatus-tab-nav {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
}
.corestatus-tab-nav > .cbi-tabmenu {
	grid-column: 2;
	grid-row: 1;
	min-width: 0;
}
.corestatus-tab-nav > [data-section-id] {
	grid-column: 1 / -1;
	grid-row: 2;
}
.corestatus-tab-nav-button {
	display: none;
	align-items: center;
	justify-content: center;
	box-sizing: border-box;
	width: 2.2em;
	height: 2.2em;
	padding: 0;
	font-size: 1rem;
	line-height: 1;
	cursor: pointer;
	color: var(--primary-color-high, var(--primary, #1976d2));
	background-color: var(--background-color-low, var(--surface-muted, rgba(128, 128, 128, 0.12)));
	border: 1px solid var(--border-color-medium, var(--border-color, rgba(128, 128, 128, 0.4)));
	border-radius: 4px;
}
.corestatus-tab-nav-overflow > .corestatus-tab-nav-button {
	display: inline-flex;
}
.corestatus-tab-nav-button:not(:disabled):hover {
	background-color: var(--background-color-medium, rgba(128, 128, 128, 0.2));
}
.corestatus-tab-nav-button:disabled {
	opacity: 0.4;
	cursor: default;
}
.corestatus-tab-nav-prev {
	grid-column: 1;
	grid-row: 1;
}
.corestatus-tab-nav-next {
	grid-column: 3;
	grid-row: 1;
}
`));

return baseclass.extend({
	// A tab group built by ui.tabs.initTabGroup() puts the <ul.cbi-tabmenu>
	// directly before the pane container. LuCI's switchTab() and updateTabs()
	// rely on that adjacency (menu.nextElementSibling / previousElementSibling),
	// so the wrapper must keep menu and group as direct siblings in that order.
	setup(group) {
		if (group == null || group.parentNode == null)
			return;

		let menu = group.previousElementSibling;

		if (menu == null || !menu.classList.contains('cbi-tabmenu'))
			return;

		if (group.parentNode.classList.contains('corestatus-tab-nav'))
			return;

		let wrapper = E('div', { 'class': 'corestatus-tab-nav' });
		group.parentNode.insertBefore(wrapper, menu);
		wrapper.append(menu, group);

		let visibleTabs = () => Array.prototype.filter.call(menu.children,
			li => li.hasAttribute('data-tab') && li.style.display !== 'none');

		let activeIndex = list => list.findIndex(li => li.classList.contains('cbi-tab'));

		let overflowing = () => menu.scrollWidth > menu.clientWidth + 1;

		let reveal = li => {
			let menuRect = menu.getBoundingClientRect();
			let tabRect  = li.getBoundingClientRect();
			let pad = 8;

			if (tabRect.left < menuRect.left + pad)
				menu.scrollLeft -= (menuRect.left + pad - tabRect.left);
			else if (tabRect.right > menuRect.right - pad)
				menu.scrollLeft += (tabRect.right - (menuRect.right - pad));
		};

		let update = () => {
			let list = visibleTabs();
			let idx  = activeIndex(list);
			let over = overflowing();

			wrapper.classList.toggle('corestatus-tab-nav-overflow', over);

			prevBtn.disabled = (idx <= 0);
			nextBtn.disabled = (idx < 0 || idx >= list.length - 1);

			if (over && idx >= 0)
				reveal(list[idx]);
		};

		let step = delta => {
			let list = visibleTabs();
			let idx  = activeIndex(list);
			let next = Math.min(list.length - 1, Math.max(0, idx + delta));

			if (next !== idx) {
				let link = list[next] ? list[next].querySelector('a') : null;

				if (link)
					link.click();
			}

			update();
		};

		let prevBtn = E('button', {
			'type': 'button',
			'class': 'corestatus-tab-nav-button corestatus-tab-nav-prev',
			'title': _('Previous tab'),
			'aria-label': _('Previous tab'),
			'click': ev => { ev.preventDefault(); step(-1); }
		}, '‹');

		let nextBtn = E('button', {
			'type': 'button',
			'class': 'corestatus-tab-nav-button corestatus-tab-nav-next',
			'title': _('Next tab'),
			'aria-label': _('Next tab'),
			'click': ev => { ev.preventDefault(); step(1); }
		}, '›');

		wrapper.append(prevBtn, nextBtn);

		menu.addEventListener('click', () => update());
		window.addEventListener('resize', () => update());

		if (typeof ResizeObserver === 'function')
			new ResizeObserver(() => update()).observe(menu);

		requestAnimationFrame(() => update());
		update();
	}
});
