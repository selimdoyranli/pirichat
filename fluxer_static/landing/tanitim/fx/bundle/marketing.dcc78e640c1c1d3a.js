// SPDX-License-Identifier: LicenseRef-Fluxer-Proprietary

(() => {
	window.fluxerMarketingLifecycle?.abort();
	const lifecycle = new AbortController();
	window.fluxerMarketingLifecycle = lifecycle;
	const {signal} = lifecycle;
	const marketingScriptSrc = document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : '';

	const whiteInteriorToggle = document.querySelector('[data-press-white-interior-toggle]');

	if (whiteInteriorToggle !== null) {
		if (!(whiteInteriorToggle instanceof HTMLInputElement) || whiteInteriorToggle.type !== 'checkbox') {
			throw new Error('Press white-interior toggle must be a checkbox');
		}

		function updatePressAssets() {
			document.querySelectorAll('[data-press-asset-preview]').forEach((preview) => {
				if (!(preview instanceof HTMLImageElement)) {
					throw new Error('Press asset preview must be an image');
				}
				const src = whiteInteriorToggle.checked
					? preview.dataset.pressWhiteInteriorSrc
					: preview.dataset.pressOriginalSrc;
				if (!src) {
					throw new Error('Press asset preview is missing a source variant');
				}
				preview.src = src;
			});

			document.querySelectorAll('[data-press-asset-download]').forEach((download) => {
				if (!(download instanceof HTMLAnchorElement)) {
					throw new Error('Press asset download must be a link');
				}
				const href = whiteInteriorToggle.checked
					? download.dataset.pressWhiteInteriorHref
					: download.dataset.pressOriginalHref;
				const filename = whiteInteriorToggle.checked
					? download.dataset.pressWhiteInteriorDownload
					: download.dataset.pressOriginalDownload;
				if (!href || !filename) {
					throw new Error('Press asset download is missing a link variant');
				}
				download.href = href;
				download.download = filename;
			});
		}

		whiteInteriorToggle.addEventListener('change', updatePressAssets);
		updatePressAssets();
	}

	const blogThemeToggle = document.querySelector('[data-blog-theme-toggle]');

	if (blogThemeToggle !== null) {
		const blogThemeOptions = [...blogThemeToggle.querySelectorAll('[data-blog-theme-option]')];
		const blogThemeValues = blogThemeOptions.map((option) => option.dataset.blogThemeOption).sort().join(',');
		if (blogThemeValues !== 'dark,light' || !blogThemeOptions.every((option) => option instanceof HTMLButtonElement)) {
			throw new Error('Blog theme toggle needs one light and one dark button');
		}

		function applyBlogTheme(theme) {
			document.documentElement.dataset.blogTheme = theme;
			blogThemeOptions.forEach((option) => {
				option.setAttribute('aria-pressed', String(option.dataset.blogThemeOption === theme));
			});
		}

		blogThemeOptions.forEach((option) => {
			option.addEventListener('click', () => {
				const theme = option.dataset.blogThemeOption;
				applyBlogTheme(theme);
				try {
					localStorage.setItem('fluxer-blog-theme', theme);
				} catch (error) {
					console.warn('The blog theme could not be saved.', error);
				}
			});
		});

		applyBlogTheme(document.documentElement.dataset.blogTheme === 'light' ? 'light' : 'dark');
	}

	document.querySelectorAll('[data-download-selector]').forEach((root) => {
		if (!(root instanceof HTMLElement)) {
			throw new Error('Download selector root must be an element');
		}
		const menu = root.querySelector('[data-download-menu="variant"]');
		const trigger = menu?.querySelector('[data-download-trigger]');
		const list = menu?.querySelector('[data-download-menu-list]');
		const menuOptions = list ? [...list.querySelectorAll('[data-download-option]')] : [];
		if (!(menu instanceof HTMLElement) || !(trigger instanceof HTMLButtonElement) || !(list instanceof HTMLElement) || menuOptions.length === 0) {
			throw new Error('Download selector is missing its build menu');
		}
		if (trigger.getAttribute('aria-haspopup') !== 'listbox' || trigger.getAttribute('aria-controls') !== list.id) {
			throw new Error('Download selector has an invalid build menu contract');
		}
		const buildMenu = {menu, trigger, list, options: menuOptions};
		function setOpen(menu, open) {
			menu.trigger.setAttribute('aria-expanded', String(open));
			menu.list.hidden = !open;
			menu.list.classList.toggle('hidden', !open);
		}
		function closeMenus() {
			setOpen(buildMenu, false);
		}
		function focusOption(menu, index) {
			const bounded = Math.max(0, Math.min(index, menu.options.length - 1));
			menu.options[bounded]?.focus();
		}
		function toggleMenu(focusLast) {
			const open = buildMenu.trigger.getAttribute('aria-expanded') === 'true';
			closeMenus();
			if (!open) {
				setOpen(buildMenu, true);
				focusOption(buildMenu, focusLast ? buildMenu.options.length - 1 : 0);
			}
		}
		buildMenu.trigger.addEventListener('click', () => toggleMenu(false));
		buildMenu.trigger.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') { event.preventDefault(); closeMenus(); return; }
			if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
				event.preventDefault();
				toggleMenu(event.key === 'ArrowUp');
				return;
			}
			if (event.key === 'Enter' || event.key === ' ') {
				event.preventDefault();
				toggleMenu(false);
			}
		});
		buildMenu.options.forEach((option, index) => {
			option.addEventListener('click', () => closeMenus());
			option.addEventListener('keydown', (event) => {
				if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focusOption(buildMenu, index + (event.key === 'ArrowDown' ? 1 : -1)); }
				else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); focusOption(buildMenu, event.key === 'Home' ? 0 : buildMenu.options.length - 1); }
				else if (event.key === ' ') { event.preventDefault(); option.click(); }
				else if (event.key === 'Escape') { event.preventDefault(); closeMenus(); buildMenu.trigger.focus(); }
				else if (event.key === 'Tab') { closeMenus(); }
			});
		});
		document.addEventListener('click', (event) => {
			if (event.target instanceof Node && !root.contains(event.target)) closeMenus();
		}, {signal});
		closeMenus();
	});

	function downloadCtaArchitecture(value) {
		const normalized = value.toLowerCase();
		if (/arm64|aarch64/u.test(normalized)) return 'arm64';
		if (/x86_64|amd64|x64|win64|x86/u.test(normalized)) return 'x64';
		return 'unknown';
	}

	function downloadCtaFallbackArchitecture() {
		const architecture = downloadCtaArchitecture(`${navigator.platform} ${navigator.userAgent}`);
		if (architecture !== 'unknown') return architecture;
		return 'x64';
	}

	async function downloadCtaArchitectureFromUserAgentData() {
		const userAgentData = navigator.userAgentData;
		if (!userAgentData?.getHighEntropyValues) return downloadCtaFallbackArchitecture();
		try {
			const values = await userAgentData.getHighEntropyValues(['architecture', 'bitness']);
			if (values.architecture === 'arm' && values.bitness === '64') return 'arm64';
			const architecture = downloadCtaArchitecture(`${values.architecture ?? ''} ${values.bitness ?? ''}`);
			return architecture === 'unknown' ? downloadCtaFallbackArchitecture() : architecture;
		} catch {
			return downloadCtaFallbackArchitecture();
		}
	}

	function downloadCtaData(anchor, key) {
		const value = anchor.dataset[key];
		if (!value) throw new Error(`Download CTA is missing data-${key}`);
		return value;
	}

	async function updateDownloadCta(anchor) {
		const label = anchor.querySelector('[data-download-cta-label]');
		if (!(label instanceof HTMLElement)) throw new Error('Download CTA is missing its label');
		const platform = document.documentElement.dataset.platform;
		if (platform === 'macos') {
			anchor.href = downloadCtaData(anchor, 'downloadMacosHref');
			label.textContent = downloadCtaData(anchor, 'downloadMacosLabel');
			return;
		}
		if (platform === 'windows') {
			label.textContent = downloadCtaData(anchor, 'downloadWindowsLabel');
			const architecture = await downloadCtaArchitectureFromUserAgentData();
			anchor.href = downloadCtaData(anchor, architecture === 'arm64' ? 'downloadWindowsArm64Href' : 'downloadWindowsX64Href');
			return;
		}
		if (platform === 'linux') {
			anchor.href = downloadCtaData(anchor, 'downloadLinuxHref');
			label.textContent = downloadCtaData(anchor, 'downloadLinuxLabel');
			return;
		}
		if (platform === 'ios') {
			anchor.href = downloadCtaData(anchor, 'downloadIosHref');
			label.textContent = downloadCtaData(anchor, 'downloadIosLabel');
			anchor.rel = 'noopener noreferrer';
			return;
		}
		if (platform === 'android') {
			anchor.href = downloadCtaData(anchor, 'downloadAndroidHref');
			label.textContent = downloadCtaData(anchor, 'downloadAndroidLabel');
			anchor.rel = 'noopener noreferrer';
		}
	}

	document.querySelectorAll('a[data-download-cta="true"][data-download-auto-detect="true"]').forEach((anchor) => {
		if (!(anchor instanceof HTMLAnchorElement)) throw new Error('Download CTA must be a link');
		void updateDownloadCta(anchor);
	});

	const deferredOverlays = [...document.querySelectorAll('.perk-overlay-svg')].filter((svg) => svg.querySelector('image[data-href]'));

	if (deferredOverlays.length > 0 && typeof IntersectionObserver === 'function') {
		const overlayMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		const overlayObserver = new IntersectionObserver((entries) => {
			if (overlayMotionQuery.matches) return;
			entries.forEach((entry) => {
				if (!entry.isIntersecting) return;
				entry.target.querySelectorAll('image[data-href]').forEach((image) => image.setAttribute('href', image.dataset.href));
				overlayObserver.unobserve(entry.target);
			});
		}, {rootMargin: '150px 0px'});

		function observePendingOverlays() {
			deferredOverlays.forEach((svg) => {
				if (!svg.querySelector('image[data-href]:not([href])')) return;
				overlayObserver.unobserve(svg);
				overlayObserver.observe(svg);
			});
		}

		observePendingOverlays();
		overlayMotionQuery.addEventListener('change', observePendingOverlays, {signal});
		signal.addEventListener('abort', () => overlayObserver.disconnect(), {once: true});
	}

	const FOCUSABLE_SELECTOR =
		'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]';

	const overlayStack = [];

	function focusableElements(root) {
		return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
			(element) =>
				element.tabIndex >= 0 &&
				element.getClientRects().length > 0 &&
				element.closest('[hidden], [inert], [aria-hidden="true"]') === null,
		);
	}

	function trapFocus(root) {
		releaseFocus(root);
		overlayStack.push(root);
	}

	function releaseFocus(root) {
		const index = overlayStack.indexOf(root);
		if (index !== -1) {
			overlayStack.splice(index, 1);
		}
	}

	function focusOverlay(root) {
		if (root.contains(document.activeElement)) return;
		const panel = root.querySelector('.sheet-panel') ?? root;
		if (!(panel instanceof HTMLElement)) return;
		const autofocus = panel.querySelector('[autofocus]');
		const target = autofocus instanceof HTMLElement ? autofocus : focusableElements(panel)[0];
		if (target instanceof HTMLElement) {
			target.focus();
			return;
		}
		panel.tabIndex = -1;
		panel.focus();
	}

	document.addEventListener('keydown', (event) => {
		if (event.key !== 'Tab' || event.defaultPrevented) return;
		const root = overlayStack.at(-1);
		if (!(root instanceof HTMLElement) || !root.isConnected) return;
		const focusable = focusableElements(root);
		const first = focusable[0];
		const last = focusable.at(-1);
		if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) return;
		const active = document.activeElement;
		if (!root.contains(active)) {
			event.preventDefault();
			(event.shiftKey ? last : first).focus();
			return;
		}
		if (event.shiftKey && active === first) {
			event.preventDefault();
			last.focus();
			return;
		}
		if (!event.shiftKey && active === last) {
			event.preventDefault();
			first.focus();
		}
	}, {signal});

	window.addEventListener('resize', () => {
		const root = overlayStack.at(-1);
		if (root instanceof HTMLElement && root.checkVisibility?.() === false) root.hidePopover();
	}, {signal});

	const wideDisclosureQuery = window.matchMedia('(min-width: 48rem)');
	const disclosureDefaults = new WeakMap();

	function markedDisclosures() {
		return Array.from(document.querySelectorAll('.disclosure-md-open'));
	}

	function hashTargetElement() {
		const hash = window.location.hash;
		if (hash.length < 2) return null;
		const raw = hash.slice(1);
		let decoded = raw;
		try {
			decoded = decodeURIComponent(raw);
		} catch {
			decoded = raw;
		}
		return document.getElementById(decoded) ?? document.getElementById(raw);
	}

	function captureDisclosureDefaults() {
		markedDisclosures().forEach((details) => {
			if (!(details instanceof HTMLDetailsElement)) {
				throw new Error('disclosure-md-open must be on a details element');
			}
			if (!disclosureDefaults.has(details)) {
				disclosureDefaults.set(details, details.hasAttribute('data-narrow-open'));
			}
		});
	}

	const pinnedDisclosures = new WeakSet();

	function syncDisclosures() {
		const wide = wideDisclosureQuery.matches;
		const target = hashTargetElement();
		markedDisclosures().forEach((details) => {
			if (!(details instanceof HTMLDetailsElement)) return;
			const summary = details.querySelector(':scope > summary');
			if (!pinnedDisclosures.has(details)) {
				pinnedDisclosures.add(details);
				details.addEventListener('toggle', () => {
					if (wideDisclosureQuery.matches && !details.open) details.open = true;
				});
			}
			if (wide) {
				details.open = true;
				summary?.setAttribute('tabindex', '-1');
				return;
			}
			summary?.removeAttribute('tabindex');
			if (details.contains(document.activeElement)) return;
			if (target !== null && details.contains(target)) return;
			details.open = disclosureDefaults.get(details) ?? details.hasAttribute('data-narrow-open');
		});
		document.documentElement.classList.remove('pre-sync');
	}

	function openTargetDisclosure() {
		const target = hashTargetElement();
		if (target === null) return;
		let opened = false;
		let details = target.closest('details');
		while (details instanceof HTMLDetailsElement) {
			if (!details.open) {
				details.open = true;
				opened = true;
			}
			details = details.parentElement?.closest('details') ?? null;
		}
		if (opened) target.scrollIntoView();
	}

	function popoverSupported() {
		return typeof HTMLElement.prototype.showPopover === 'function';
	}

	function isPopoverOpen(popover) {
		try {
			return popover.matches(':popover-open');
		} catch {
			return false;
		}
	}

	function showPopoverElement(popover) {
		if (!popoverSupported() || isPopoverOpen(popover)) return false;
		try {
			popover.showPopover();
		} catch {
			return false;
		}
		return true;
	}

	const overlayInert = new Set();
	let overlayInertOwner = null;

	function applyOverlayInert(popover) {
		if (overlayInertOwner !== null) return;
		overlayInertOwner = popover;
		let node = popover;
		while (node !== document.body && node.parentElement !== null) {
			for (const sibling of node.parentElement.children) {
				if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
				sibling.inert = true;
				overlayInert.add(sibling);
			}
			node = node.parentElement;
		}
	}

	function releaseOverlayInert(popover) {
		if (overlayInertOwner !== popover) return;
		overlayInertOwner = null;
		for (const element of overlayInert) element.inert = false;
		overlayInert.clear();
	}

	function restoreOverlayFocus(popover) {
		const active = document.activeElement;
		if (active !== null && active !== document.body) return;
		const id = popover.getAttribute('id');
		if (id === null) return;
		const invoker = document.querySelector(
			`[popovertarget="${id}"]:not([popovertargetaction="hide"])`,
		);
		if (invoker instanceof HTMLElement && invoker.checkVisibility?.()) invoker.focus();
	}

	function initializePopovers() {
		if (!popoverSupported()) return;
		document.querySelectorAll('[popover]').forEach((popover) => {
			if (!(popover instanceof HTMLElement)) return;
			if (popover.classList.contains('sheet')) {
				popover.addEventListener('click', (event) => {
					if (event.target === popover) popover.hidePopover();
				});
			}
			popover.addEventListener('beforetoggle', (event) => {
				if (!popover.classList.contains('sheet')) return;
				if (event.newState === 'closed') releaseOverlayInert(popover);
			});
			popover.addEventListener('toggle', (event) => {
				const open =
					typeof event.newState === 'string' ? event.newState === 'open' : isPopoverOpen(popover);
				if (!popover.classList.contains('sheet')) return;
				if (open) {
					applyOverlayInert(popover);
					trapFocus(popover);
					focusOverlay(popover);
				} else {
					releaseOverlayInert(popover);
					releaseFocus(popover);
					restoreOverlayFocus(popover);
				}
			});
		});
	}

	function clearLocationHash() {
		if (window.location.hash === '') return;
		const url = new URL(window.location.href);
		url.hash = '';
		window.history.replaceState(window.history.state, '', url);
	}

	function openHashPopover() {
		const target = hashTargetElement();
		if (!(target instanceof HTMLElement) || !target.hasAttribute('popover')) return false;
		if (!showPopoverElement(target)) return false;
		clearLocationHash();
		return true;
	}

	function openQueryPopover() {
		const params = new URLSearchParams(window.location.search);
		if (params.get('swish') !== '1') return;
		const sheet =
			document.getElementById('swish-sheet') ?? document.getElementById('swish-modal-backdrop');
		if (!(sheet instanceof HTMLElement) || !sheet.hasAttribute('popover')) return;
		showPopoverElement(sheet);
	}

	document.addEventListener('click', (event) => {
		if (!(event.target instanceof Element) || !popoverSupported()) return;
		const invoker = event.target.closest('[popovertarget]');
		if (!(invoker instanceof HTMLElement)) return;
		if (invoker.getAttribute('popovertargetaction') === 'hide') return;
		const origin = invoker.closest('.sheet');
		if (!(origin instanceof HTMLElement) || !isPopoverOpen(origin)) return;
		const target = document.getElementById(invoker.getAttribute('popovertarget') ?? '');
		if (!(target instanceof HTMLElement) || target === origin || origin.contains(target)) return;
		if (!target.hasAttribute('popover') || isPopoverOpen(target)) return;
		event.preventDefault();
		origin.hidePopover();
		showPopoverElement(target);
	}, {signal});

	const posterPendingClips = [...document.querySelectorAll('video[data-poster]:not([poster])')];

	function showClipPoster(clip) {
		if (!clip.hasAttribute('poster')) clip.poster = clip.dataset.poster;
	}

	if (posterPendingClips.length > 0 && typeof IntersectionObserver === 'function') {
		const posterLoader = new IntersectionObserver((entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				showClipPoster(entry.target);
				posterLoader.unobserve(entry.target);
			}
		}, {rootMargin: '200% 0px'});

		for (const clip of posterPendingClips) posterLoader.observe(clip);
		window.addEventListener('beforeprint', () => {
			posterLoader.disconnect();
			posterPendingClips.forEach(showClipPoster);
		}, {signal});
		signal.addEventListener('abort', () => posterLoader.disconnect(), {once: true});
	} else {
		posterPendingClips.forEach(showClipPoster);
	}

	const inViewClips = [...document.querySelectorAll('video[data-autoplay-in-view]')];

	if (inViewClips.length > 0 && typeof IntersectionObserver === 'function') {
		const clipMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

		const clipPreloader = new IntersectionObserver((entries) => {
			if (clipMotionQuery.matches) return;
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.preload = 'auto';
				clipPreloader.unobserve(entry.target);
			}
		}, {rootMargin: '100% 0px'});

		const clipPlayer = new IntersectionObserver((entries) => {
			if (clipMotionQuery.matches) return;
			for (const entry of entries) {
				const clip = entry.target;
				if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
					clip.play().catch(() => {});
				} else {
					clip.pause();
				}
			}
		}, {threshold: 0.5});

		function syncClipMotion() {
			clipPreloader.disconnect();
			clipPlayer.disconnect();
			if (clipMotionQuery.matches) {
				for (const clip of inViewClips) {
					if (!clip.paused || clip.currentTime > 0) clip.load();
				}
				return;
			}
			for (const clip of inViewClips) {
				if (clip.preload !== 'auto') clipPreloader.observe(clip);
				clipPlayer.observe(clip);
			}
		}

		for (const clip of inViewClips) {
			if (!(clip instanceof HTMLVideoElement)) {
				throw new Error('In-view autoplay clip must be a video element');
			}
		}

		clipMotionQuery.addEventListener('change', syncClipMotion, {signal});
		signal.addEventListener('abort', () => {
			clipPreloader.disconnect();
			clipPlayer.disconnect();
		}, {once: true});
		syncClipMotion();
	}

	document.querySelectorAll('[data-lang-select], [data-dropdown]').forEach((select) => {
		if (!(select instanceof HTMLDetailsElement)) {
			throw new Error('Language select must be a details element');
		}
		const summary = select.querySelector(':scope > summary');
		const panel = select.querySelector('.lang-select-panel');
		const list = select.querySelector('.lang-select-list');
		if (!(summary instanceof HTMLElement) || !(panel instanceof HTMLElement) || !(list instanceof HTMLElement)) {
			throw new Error('Language select is missing its button, panel or list');
		}
		const options = () => [...list.querySelectorAll('.lang-select-option, .download-menu-accordion-summary')].filter((option) => option.getClientRects().length > 0);
		const currentOption = () => list.querySelector('.lang-select-option[aria-current="true"]');

		function openSelect() {
			select.classList.remove('lang-select-up');
			select.open = true;
			const rect = summary.getBoundingClientRect();
			const below = window.innerHeight - rect.bottom;
			if (below < panel.offsetHeight + 12 && rect.top > below) select.classList.add('lang-select-up');
			const current = currentOption();
			if (current instanceof HTMLElement) {
				const offset = current.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
				list.scrollTop = offset - list.clientHeight / 2 + current.offsetHeight / 2;
			}
		}

		function closeSelect(restoreFocus) {
			if (!select.open) return;
			select.open = false;
			select.classList.remove('lang-select-up');
			if (restoreFocus) summary.focus();
		}

		summary.addEventListener('click', (event) => {
			event.preventDefault();
			if (select.open) {
				closeSelect(false);
				return;
			}
			openSelect();
		});

		document.addEventListener('pointerdown', (event) => {
			if (select.open && event.target instanceof Node && !select.contains(event.target)) closeSelect(false);
		}, {signal});

		document.addEventListener('focusin', (event) => {
			if (select.open && event.target instanceof Node && !select.contains(event.target)) closeSelect(false);
		}, {signal});

		select.addEventListener('keydown', (event) => {
			if (event.key === 'Escape' && select.open) {
				event.preventDefault();
				closeSelect(true);
				return;
			}
			if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
			event.preventDefault();
			if (!select.open) openSelect();
			const all = options();
			const index = all.indexOf(document.activeElement);
			let next = currentOption() ?? all[0];
			if (event.key === 'Home') next = all[0];
			else if (event.key === 'End') next = all.at(-1);
			else if (index !== -1) next = all[event.key === 'ArrowDown' ? Math.min(all.length - 1, index + 1) : Math.max(0, index - 1)];
			if (next instanceof HTMLElement) next.focus();
		});
	});

	function syncHeadFrom(next) {
		const root = document.documentElement;
		root.lang = next.documentElement.lang;
		root.dir = next.documentElement.dir;
		document.title = next.title;
		for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:description"]', 'meta[property="og:locale"]', 'link[rel="canonical"]']) {
			const current = document.head.querySelector(selector);
			const incoming = next.head.querySelector(selector);
			if (current && incoming) current.replaceWith(document.importNode(incoming, true));
		}
	}

	function runInlineScripts(root) {
		root.querySelectorAll('script:not([src]):not([type="application/ld+json"])').forEach((stale) => {
			const script = document.createElement('script');
			script.textContent = stale.textContent;
			stale.replaceWith(script);
		});
	}

	function rerunPageScripts() {
		if (!marketingScriptSrc) return;
		const script = document.createElement('script');
		script.src = marketingScriptSrc;
		script.addEventListener('load', () => script.remove(), {once: true});
		document.head.append(script);
		if (window.htmx && typeof window.htmx.process === 'function') window.htmx.process(document.body);
	}

	async function switchLocaleInPlace(form) {
		const anchor = form.closest('[data-lang-select]');
		const anchorTop = anchor instanceof HTMLElement ? anchor.getBoundingClientRect().top : null;
		const previousScroll = window.scrollY;
		const response = await fetch(form.action, {
			method: 'POST',
			body: new URLSearchParams(new FormData(form)),
			credentials: 'same-origin',
			headers: {Accept: 'text/html'},
		});
		if (!response.ok) throw new Error(`Locale switch failed with status ${response.status}`);
		const next = new DOMParser().parseFromString(await response.text(), 'text/html');
		next.querySelectorAll('noscript').forEach((fallback) => fallback.remove());
		const apply = () => {
			syncHeadFrom(next);
			const body = document.adoptNode(next.body);
			document.body.replaceWith(body);
			runInlineScripts(body);
			const nextAnchor = document.querySelector('[data-lang-select]');
			if (anchorTop !== null && nextAnchor instanceof HTMLElement) {
				window.scrollTo(0, window.scrollY + nextAnchor.getBoundingClientRect().top - anchorTop);
				nextAnchor.querySelector(':scope > summary')?.focus({preventScroll: true});
			} else {
				window.scrollTo(0, previousScroll);
			}
			window.history.replaceState(window.history.state, '', response.url);
		};
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		if (typeof document.startViewTransition === 'function' && !reducedMotion) {
			await document.startViewTransition(apply).updateCallbackDone;
		} else {
			apply();
		}
		rerunPageScripts();
	}

	document.querySelectorAll('.voice-region-pin').forEach((pin) => {
		if (!(pin instanceof HTMLElement)) return;
		const restoreTooltip = () => {
			delete pin.dataset.tooltipDismissed;
		};
		pin.addEventListener('pointerenter', restoreTooltip, {signal});
		pin.addEventListener('focusin', restoreTooltip, {signal});
	});

	document.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || event.repeat || event.defaultPrevented) return;
		if (Array.from(document.querySelectorAll('.sheet')).some(isPopoverOpen)) return;
		document.querySelectorAll('.voice-region-pin:hover, .voice-region-pin:focus-within').forEach((pin) => {
			if (pin instanceof HTMLElement) pin.dataset.tooltipDismissed = '';
		});
	}, {signal});

	document.addEventListener('keydown', (event) => {
		const input = event.target;
		if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-positive-integer')) return;
		if (['-', '+', 'e', 'E', '.', ','].includes(event.key)) event.preventDefault();
	}, {signal});

	document.addEventListener('input', (event) => {
		const input = event.target;
		if (!(input instanceof HTMLInputElement) || !input.hasAttribute('data-positive-integer')) return;
		const digits = input.value.replace(/[^0-9]/gu, '');
		if (digits !== input.value) input.value = digits;
	}, {signal});

	function emailFieldForRegion(region) {
		if (region.id === 'manage-message') return document.getElementById('manage-email');
		const audience = /^donation-error-([a-z]+)$/u.exec(region.id)?.[1];
		return audience ? document.getElementById(`donation-email-${audience}`) : null;
	}

	document.addEventListener('htmx:afterSwap', (event) => {
		const region = event.detail?.target;
		if (!(region instanceof HTMLElement)) return;
		const input = emailFieldForRegion(region);
		if (!(input instanceof HTMLInputElement)) return;
		const describedBy = (input.getAttribute('aria-describedby') ?? '').split(/\s+/u).filter((id) => id !== '' && id !== region.id && id !== 'manage-alert');
		input.removeAttribute('aria-invalid');
		const invalid = region.querySelector('[data-field="email"]') !== null;
		if (invalid) {
			input.setAttribute('aria-invalid', 'true');
			describedBy.push(region.id);
		}
		if (describedBy.length > 0) {
			input.setAttribute('aria-describedby', describedBy.join(' '));
		} else {
			input.removeAttribute('aria-describedby');
		}
		if (invalid) input.focus();
	}, {signal});

	document.addEventListener('submit', (event) => {
		const form = event.target;
		if (!(form instanceof HTMLFormElement) || !form.matches('form[action$="/_locale"]')) return;
		if (typeof fetch !== 'function' || typeof DOMParser !== 'function') return;
		event.preventDefault();
		if (form.dataset.localeSwitching === 'true') return;
		form.dataset.localeSwitching = 'true';
		switchLocaleInPlace(form).catch((error) => {
			console.warn('In-place language switch failed, reloading instead.', error);
			form.dataset.localeSwitching = 'false';
			HTMLFormElement.prototype.submit.call(form);
		});
	}, {signal});

	wideDisclosureQuery.addEventListener('change', syncDisclosures, {signal});

	window.addEventListener('hashchange', () => {
		if (openHashPopover()) return;
		openTargetDisclosure();
	}, {signal});

	function initializeCopyButtons() {
		document.querySelectorAll('[data-copy]').forEach((button) => {
			if (!(button instanceof HTMLButtonElement)) return;
			button.addEventListener('click', async () => {
				const text = button.dataset.copy ?? '';
				const copied = button.dataset.copiedLabel ?? 'Copied';
				const idle = button.dataset.copyLabel ?? button.textContent ?? 'Copy';
				try {
					await navigator.clipboard.writeText(text);
				} catch {
					return;
				}
				button.textContent = copied;
				button.dataset.copied = 'true';
				window.setTimeout(() => {
					button.textContent = idle;
					delete button.dataset.copied;
				}, 2000);
			}, {signal});
		});
	}

	initializeCopyButtons();
	initializePopovers();
	openQueryPopover();
	const hashPopoverOpened = openHashPopover();
	captureDisclosureDefaults();
	syncDisclosures();
	if (!hashPopoverOpened) openTargetDisclosure();
})();
