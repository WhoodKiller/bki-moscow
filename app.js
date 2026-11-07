(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const projects = window.BKI_PROJECTS || [];
  const grid = $('#project-grid');
  const search = $('#project-search');
  const filters = [...document.querySelectorAll('[data-filter]')];
  let activeFilter = 'all';
  let visibleLimit = 8;
  const normalize = value => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[\s«»"\-–—]/g, '');
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const nav = $('#main-nav');
  const menu = $('.menu-toggle');
  function closeMenu() {
    nav.classList.remove('is-open');
    menu.setAttribute('aria-expanded', 'false');
    menu.setAttribute('aria-label', 'Открыть меню');
  }
  menu.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') !== 'true';
    nav.classList.toggle('is-open', open);
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    if (open) nav.querySelector('a').focus();
  });
  nav.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) closeMenu(); });
  // Observe the destination: moving within the header must not hide a link before its click.
  document.addEventListener('focusin', event => {
    if (menu.getAttribute('aria-expanded') === 'true' && !event.target.closest('.site-header')) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      closeMenu(); menu.focus();
    }
  });
  window.matchMedia('(min-width: 981px)').addEventListener('change', closeMenu);

  const cards = projects.map(project => {
    const existing = grid.querySelector(`[data-project-id="${project.id}"]`);
    if (existing) return { card: existing, project };
    const card = element('article', 'project-card' + (project.drawing ? ' is-drawing' : ''));
    card.dataset.projectId = project.id;
    card.dataset.type = project.type;
    const button = element('button', 'project-open');
    button.type = 'button';
    button.dataset.project = project.id;
    button.setAttribute('aria-label', 'Открыть проект: ' + project.title);
    const media = element('div', 'project-media');
    const img = element('img');
    img.src = project.images[0].displaySrc || project.images[0].src;
    if (project.images[0].srcSet) img.srcset = project.images[0].srcSet;
    img.sizes = '(max-width: 359px) calc(100vw - 34px), (max-width: 640px) calc(100vw - 42px), (max-width: 1368px) calc(46.8vw - 16px), 624px';
    img.alt = project.images[0].alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.width = 1000; img.height = 625;
    media.append(img, element('span', 'project-badge mono', project.drawing ? 'ПРОЕКТНАЯ ГРАФИКА' : project.category), element('span', 'project-arrow', '↗'));
    const meta = element('div', 'project-card-meta');
    meta.append(element('span', 'mono', project.code), element('h3', '', project.title));
    button.append(media, meta, element('p', '', project.summary));
    const detail = element('a', 'project-detail-link', 'Описание и материалы проекта →');
    detail.href = `/proekty/${encodeURIComponent(project.id)}/`;
    card.append(button, detail); grid.append(card);
    return { card, project };
  });
  $('#project-total').textContent = String(projects.length).padStart(2, '0');
  function applyFilters() {
    const term = normalize(search.value.trim());
    let count = 0;
    for (const { card, project } of cards) {
      const categoryMatch = activeFilter === 'all' || (activeFilter === 'drawing' ? project.images.some(img => img.drawing) : activeFilter === project.type);
      const textMatch = normalize([project.title, project.code, project.summary, project.category].join(' ')).includes(term);
      const match = categoryMatch && textMatch;
      if (match) count++;
      card.hidden = !match || count > visibleLimit;
    }
    $('#results-status').textContent = `ПОКАЗАНО: ${String(Math.min(count, visibleLimit)).padStart(2, '0')} / ${String(count).padStart(2, '0')}`;
    $('#empty-state').hidden = count > 0;
    $('#show-more').hidden = count <= visibleLimit;
    $('#show-more').textContent = `Ещё проекты (${Math.max(0, count - visibleLimit)}) ↓`;
  }
  filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    visibleLimit = 8;
    filters.forEach(item => {
      item.classList.toggle('active', item === button);
      item.setAttribute('aria-pressed', String(item === button));
    });
    applyFilters();
  }));
  search.addEventListener('input', () => { visibleLimit = 8; applyFilters(); });
  $('#show-more').addEventListener('click', () => {
    const shown = new Set(cards.filter(({card}) => !card.hidden).map(({card}) => card));
    visibleLimit += 8;
    applyFilters();
    const firstNew = cards.find(({card}) => !card.hidden && !shown.has(card));
    firstNew?.card.querySelector('.card-gallery-open, .project-open')?.focus({ preventScroll: true });
  });
  $('#reset-search').addEventListener('click', () => {
    search.value = '';
    filters[0].click();
    search.focus();
  });
  $('#view-all-projects').addEventListener('click', () => {
    search.value = '';
    filters[0].click();
    visibleLimit = projects.length;
    applyFilters();
    $('#projects').scrollIntoView({ block: 'start' });
    cards[0]?.card.querySelector('.card-gallery-open, .project-open')?.focus({ preventScroll: true });
  });
  $('#view-all-projects').hidden = false;
  applyFilters();

  const galleryAPI = window.BKIGallery;
  galleryAPI.initCards(document, projects);

  const dialog = $('#project-dialog');
  const stage = $('.dialog-gallery');
  let currentProject = null;
  let opener = null;
  let gallery = null;
  function closeProject() {
    gallery?.destroy();
    gallery = null;
    dialog.close();
  }
  function openProject(id, trigger) {
    const project = projects.find(item => item.id === id);
    if (!project?.images?.length) return;
    const displayedIndex = Number(trigger?.dataset?.imageIndex);
    const startIndex = Number.isInteger(displayedIndex) && displayedIndex >= 0 && displayedIndex < project.images.length ? displayedIndex : 0;
    currentProject = project; opener = trigger;
    $('#dialog-title').textContent = project.title;
    $('#dialog-detail').href = `/proekty/${encodeURIComponent(project.id)}/`;
    $('#dialog-code').textContent = project.code + ' / ' + project.category;
    $('#dialog-description').textContent = project.description;
    $('#dialog-source').textContent = 'ПРОЕКТНЫЕ ДАННЫЕ: ' + project.source;
    const facts = $('#dialog-facts'); facts.replaceChildren();
    for (const [label, value] of project.facts || []) {
      const row = element('div'); row.append(element('dt', '', label), element('dd', '', value)); facts.append(row);
    }
    facts.hidden = !facts.children.length;
    document.body.classList.add('dialog-open');
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    gallery?.destroy();
    gallery = galleryAPI.createCarousel(stage, {
      images: project.images, title: project.title, initialIndex: startIndex, immediate: true,
      sizes: '(max-width: 980px) calc(100vw - 52px), 600px',
      onActivate: (index, trigger) => window.BKIViewer.open({
        images: project.images, index, title: project.title, trigger,
        onChange: index => gallery?.select(index, false)
      })
    });
  }
  document.addEventListener('click', event => {
    if (event.defaultPrevented) return;
    const trigger = event.target.closest('[data-project]');
    if (trigger) openProject(trigger.dataset.project, trigger);
  });
  $('.dialog-close').addEventListener('click', closeProject);
  dialog.addEventListener('cancel', event => { event.preventDefault(); closeProject(); });
  dialog.addEventListener('close', () => {
    // Native close is queued: an old close event must not invalidate a reopened dialog.
    if (dialog.open) return;
    gallery?.destroy();
    gallery = null;
    document.body.classList.remove('dialog-open');
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeProject();
  });
  dialog.addEventListener('keydown', event => {
    if (!dialog.open || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Tab') {
      const controls = [...dialog.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]')].filter(control => {
        if (control.tabIndex < 0 || control.matches(':disabled, [aria-disabled="true"]') || control.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
        const visibility = getComputedStyle(control).visibility;
        return control.getClientRects().length > 0 && visibility !== 'hidden' && visibility !== 'collapse';
      });
      const first = controls[0];
      const last = controls[controls.length - 1];
      const active = document.activeElement;
      if (!first || !controls.includes(active) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault();
        // Reveal the newly focused control inside the scrollable dialog.
        (event.shiftKey ? last : first)?.focus();
        if (!first) dialog.focus({ preventScroll: true });
      }
      return;
    }
    if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (currentProject?.images.length > 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault(); gallery.step(event.key === 'ArrowRight' ? 1 : -1);
    }
  });
})();
