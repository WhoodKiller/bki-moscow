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
    card.dataset.type = project.type;
    const button = element('button', 'project-open');
    button.type = 'button';
    button.dataset.project = project.id;
    button.setAttribute('aria-label', 'Открыть проект: ' + project.title);
    const media = element('div', 'project-media');
    const img = element('img');
    img.src = project.images[0].src;
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
    firstNew?.card.querySelector('button').focus({ preventScroll: true });
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
    cards[0]?.card.querySelector('button').focus({ preventScroll: true });
  });
  $('#view-all-projects').hidden = false;
  applyFilters();

  const dialog = $('#project-dialog');
  const dialogImage = $('#dialog-image');
  let currentProject = null;
  let imageIndex = 0;
  let opener = null;
  const previous = $('#gallery-prev');
  const next = $('#gallery-next');
  function showImage(index) {
    imageIndex = (index + currentProject.images.length) % currentProject.images.length;
    const picture = currentProject.images[imageIndex];
    dialogImage.src = picture.src;
    dialogImage.alt = picture.alt;
    $('#gallery-caption').textContent = picture.alt;
    $('#gallery-original').href = picture.src;
    dialogImage.classList.toggle('is-drawing', Boolean(picture.drawing));
    $('#gallery-count').textContent = `${imageIndex + 1} / ${currentProject.images.length}`;
    [...$('#gallery-thumbs').children].forEach((thumb, i) => {
      thumb.classList.toggle('is-active', i === imageIndex);
      thumb.setAttribute('aria-pressed', String(i === imageIndex));
    });
  }
  function openProject(id, trigger) {
    const project = projects.find(item => item.id === id);
    if (!project) return;
    currentProject = project; opener = trigger;
    $('#dialog-title').textContent = project.title;
    $('#dialog-detail').href = `/proekty/${encodeURIComponent(project.id)}/`;
    $('#dialog-code').textContent = project.code + ' / ' + project.category;
    $('#dialog-description').textContent = project.description;
    $('#dialog-source').textContent = 'МАТЕРИАЛЫ: ' + project.source;
    const facts = $('#dialog-facts'); facts.replaceChildren();
    for (const [label, value] of project.facts || []) {
      const row = element('div'); row.append(element('dt', '', label), element('dd', '', value)); facts.append(row);
    }
    facts.hidden = !facts.children.length;
    const thumbs = $('#gallery-thumbs'); thumbs.replaceChildren();
    project.images.forEach((picture, index) => {
      const thumb = element('button', 'gallery-thumb');
      thumb.type = 'button';
      thumb.setAttribute('aria-label', `Изображение ${index + 1}: ${picture.alt}`);
      const img = element('img'); img.src = picture.src; img.alt = ''; img.loading = 'lazy';
      thumb.append(img); thumb.addEventListener('click', () => showImage(index)); thumbs.append(thumb);
    });
    const single = project.images.length < 2;
    thumbs.hidden = single; previous.disabled = single; next.disabled = single;
    showImage(0);
    document.body.classList.add('dialog-open');
    dialog.showModal(); dialog.scrollTop = 0;
  }
  document.addEventListener('click', event => {
    const trigger = event.target.closest('[data-project]');
    if (trigger) openProject(trigger.dataset.project, trigger);
  });
  previous.addEventListener('click', () => showImage(imageIndex - 1));
  next.addEventListener('click', () => showImage(imageIndex + 1));
  $('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault(); showImage(imageIndex + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  const form = $('#brief');
  const service = form.elements.service;
  const message = form.elements.message;
  const briefContext = $('#brief-context');
  const serviceValues = new Set([
    'help', 'proektirovanie-sudov', 'pereoborudovanie-sudov', 'modernizatsiya-sudov',
    'plavuchie-restorany-i-gostinitsy', 'raschety-ostoychivosti-i-prochnosti',
    'tekhnicheskoe-sostoyanie-sudov', 'avtorskiy-nadzor'
  ]);
  let briefProject = null;
  let lastContextSearch = null;
  let automaticService = service.value;
  let automaticMessage = message.value;
  let serviceEdited = service.value !== 'help';
  let messageEdited = Boolean(message.value.trim());
  const serviceTitle = () => service.selectedOptions[0]?.textContent.trim() || 'Нужна консультация';
  const projectTitle = project => `${project.title} (${project.code})`;

  function showBriefContext() {
    if (!briefContext) return;
    const parts = [];
    if (service.value !== 'help') parts.push(serviceTitle());
    if (briefProject) parts.push('Проект: ' + projectTitle(briefProject));
    briefContext.textContent = parts.length ? 'Тема обращения: ' + parts.join(' · ') : '';
    briefContext.hidden = !parts.length;
  }
  function applyProjectContext(project) {
    briefProject = project;
    if (message.value !== automaticMessage) messageEdited = true;
    if (!messageEdited) {
      automaticMessage = project
        ? `Интересует задача, похожая на проект «${project.title}» (${project.code}).\n\nМоё судно и задача: `
        : '';
      message.value = automaticMessage;
    }
    showBriefContext();
  }
  function syncUrlContext() {
    if (lastContextSearch === window.location.search) return;
    lastContextSearch = window.location.search;
    const params = new URLSearchParams(lastContextSearch);
    const serviceValue = params.getAll('service').length === 1 ? params.get('service') : null;
    const projectId = params.getAll('project').length === 1 ? params.get('project') : null;
    if (service.value !== automaticService) serviceEdited = true;
    if (!serviceEdited) {
      automaticService = serviceValues.has(serviceValue) ? serviceValue : 'help';
      service.value = automaticService;
    }
    applyProjectContext(projects.find(project => project.id === projectId) || null);
  }
  for (const type of ['input', 'change']) {
    service.addEventListener(type, () => { serviceEdited = true; showBriefContext(); });
    message.addEventListener(type, () => { messageEdited = true; });
  }
  for (const type of ['popstate', 'hashchange', 'pageshow']) {
    window.addEventListener(type, syncUrlContext);
  }
  syncUrlContext();

  $('#dialog-contact').addEventListener('click', () => {
    dialog.close();
    applyProjectContext(currentProject);
    requestAnimationFrame(() => message.focus({ preventScroll: true }));
  });
  form.addEventListener('submit', event => {
    event.preventDefault();
    for (const name of ['name', 'email', 'message']) {
      const input = form.elements[name];
      if (input === message && !messageEdited && input.value === automaticMessage) automaticMessage = input.value.trim();
      input.value = input.value.trim();
      if (!input.value) { input.reportValidity(); return; }
    }
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const direction = serviceTitle();
    const project = briefProject ? projectTitle(briefProject) : '';
    const subject = 'Обращение в БКИ: ' + direction + (project ? ' — ' + project : '');
    const body = `Здравствуйте!\n\nИмя: ${data.get('name')}\nEmail: ${data.get('email')}\nНаправление: ${direction}${project ? '\nПроект: ' + project : ''}\n\n${data.get('message')}`;
    $('#letter-text').value = subject + '\n\n' + body;
    $('#letter-result').hidden = false;
    const mailUrl = 'mailto:bki-91@yandex.ru?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    const longLetter = mailUrl.length > 1800;
    $('#open-mail').href = mailUrl;
    $('#open-mail').hidden = longLetter;
    $('#form-status').textContent = longLetter
      ? 'Письмо получилось длинным. Чтобы почтовая программа не обрезала его, скопируйте текст и отправьте на bki-91@yandex.ru.'
      : 'Письмо готово. Откройте почту или скопируйте текст и отправьте его на bki-91@yandex.ru.';
    $(longLetter ? '#copy-letter' : '#open-mail').focus({ preventScroll: true });
  });
  $('#copy-letter').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#letter-text').value);
      $('#form-status').textContent = 'Текст скопирован. Вставьте его в письмо на bki-91@yandex.ru.';
    } catch {
      $('#letter-text').focus(); $('#letter-text').select();
      $('#form-status').textContent = 'Текст выделен. Нажмите Ctrl+C или выберите «Копировать» в меню выделения.';
    }
  });
  form.querySelector('fieldset').disabled = false;
})();
