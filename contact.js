/* One contact dialog per page. Drafts live only in this document, never storage. */
(() => {
  'use strict';
  if (window.BKIContact) return;
  const EMAIL = 'bki-91@yandex.ru';
  const services = [
    ['help', 'Помогите выбрать'],
    ['proektirovanie-sudov', 'Проектирование'],
    ['pereoborudovanie-sudov', 'Переоборудование'],
    ['modernizatsiya-sudov', 'Модернизация'],
    ['plavuchie-restorany-i-gostinitsy', 'Ресторан / гостиница'],
    ['raschety-ostoychivosti-i-prochnosti', 'Остойчивость / прочность'],
    ['tekhnicheskoe-sostoyanie-sudov', 'Техническое состояние'],
    ['avtorskiy-nadzor', 'Авторский надзор'],
    ['soglasovanie-dokumentatsii-rko', 'Документация для РКО'],
    ['suda-zarubezhnoy-postroyki-rko', 'Зарубежное судно / РКО']
  ];
  const serviceIds = new Set(services.map(([id]) => id));
  // Public portfolio IDs verified against projects.js, also used for form context.
  const projectIds = new Set([
    'butterfly', 'vikont', 'klubov', 'karolina', 'sm312', 'sm336', 'sm263',
    'sm270', 'sm268', 'viking', 'sm263a', 'lk7', 'barguzin', 'orton',
    'feniks', 'sm315', 'sm329'
  ]);
  const serviceId = value => value === 'dokumentatsiya-i-pravila-rko'
    ? 'soglasovanie-dokumentatsii-rko' : (serviceIds.has(value) ? value : '');
  const clean = (value, limit = 180) => typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit) : '';
  const projectId = value => projectIds.has(value) ? value : '';
  const pathId = (path, section) => {
    const match = path.match(new RegExp('^/' + section + '/([^/]+)(?:/|/index\\.html)?$'));
    return match ? match[1] : '';
  };
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  let dialog, form, fields, status, result, letter, mail, submit, prepare, contextBox;
  let opener = null;
  let context = { project: '', projectTitle: '' };
  let lastContextRequest = '';
  let serviceManuallySelected = false;
  let resumingDraft = false;
  let pendingOpen = null;
  let busy = false;
  let lastFingerprint = '';
  let requestId = '';
  let acceptedFingerprint = '';
  let lastUrl = '';

  function conversion(event, values = { service: fields?.service?.value, project: context.project }) {
    document.dispatchEvent(new CustomEvent('bki:conversion', {
      detail: Object.freeze({
        event,
        service: serviceId(values.service),
        project: projectId(values.project)
      })
    }));
  }

  function createDialog() {
    if (dialog) return;
    dialog = document.createElement('dialog');
    dialog.id = 'contact-dialog';
    dialog.className = 'bki-contact-dialog';
    dialog.setAttribute('aria-labelledby', 'bki-contact-title');
    dialog.setAttribute('aria-describedby', 'bki-contact-intro');
    // All variable content is assigned through textContent/value, never HTML.
    dialog.innerHTML = `
      <div class="bki-contact-heading">
        <div><h2 id="bki-contact-title" tabindex="-1" autofocus>Обсудим задачу</h2></div>
        <button type="button" class="bki-contact-close" aria-label="Закрыть форму обращения">×</button>
      </div>
      <div class="bki-contact-body">
      <p id="bki-contact-intro" class="bki-contact-note">Оставьте имя и удобный контакт. Направление поможет начать разговор, подробности — по желанию.</p>
      <p id="bki-contact-context" class="bki-contact-context" hidden></p>
      <form id="bki-contact-form" novalidate>
        <fieldset class="bki-contact-fields"><legend class="bki-contact-sr">Ваше обращение</legend>
          <label for="bki-contact-name">Ваше имя <span class="bki-contact-required">(обязательно)</span></label>
          <input id="bki-contact-name" name="name" autocomplete="name" maxlength="120" required>
          <label for="bki-contact-reply">Телефон или email <span class="bki-contact-required">(обязательно)</span></label>
          <input id="bki-contact-reply" name="contact" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="254" aria-describedby="bki-contact-reply-hint" required>
          <p id="bki-contact-reply-hint" class="bki-contact-note">Один контакт, по которому вам удобно получить ответ.</p>
          <label for="bki-contact-service">Направление</label>
          <select id="bki-contact-service" name="service"></select>
          <label for="bki-contact-message">Задача <span class="bki-contact-required">(необязательно)</span></label>
          <textarea id="bki-contact-message" name="message" rows="3" maxlength="3000" placeholder="Что вы планируете или в чём хотите разобраться" aria-describedby="bki-contact-message-hint"></textarea>
          <p id="bki-contact-message-hint" class="bki-contact-note">Можно начать с описания задачи. Если есть фотографии или чертежи, их можно приложить к письму в почтовой программе.</p>
        </fieldset>
        <p id="bki-contact-mode" class="bki-contact-note"></p>
        <div class="bki-contact-actions">
          <button type="submit" class="bki-contact-button" id="bki-contact-submit">Подготовить письмо</button>
          <button type="button" class="bki-contact-button bki-contact-secondary" id="bki-contact-prepare" hidden>Подготовить письмо вместо отправки</button>
        </div>
      </form>
      <p id="bki-contact-status" class="bki-contact-status" role="status" aria-live="polite" aria-atomic="true"></p>
      <section id="bki-contact-result" class="bki-contact-result" aria-labelledby="bki-contact-letter-title" hidden>
        <h3 id="bki-contact-letter-title">Текст обращения</h3>
        <label class="bki-contact-note" for="bki-contact-letter">Проверьте текст перед отправкой на bki-91@yandex.ru.</label>
        <textarea id="bki-contact-letter" rows="7" readonly spellcheck="false"></textarea>
        <div class="bki-contact-actions">
          <a id="bki-contact-mail" class="bki-contact-button" href="mailto:bki-91@yandex.ru">Открыть почтовую программу</a>
          <button id="bki-contact-copy" type="button" class="bki-contact-button bki-contact-secondary">Скопировать текст</button>
        </div>
      </section>
      <div class="bki-contact-direct"><p>Можно связаться напрямую:</p>
        <a href="tel:+79104231884">+7 (910) 423-18-84</a>
        <a href="tel:+79166319311">+7 (916) 631-93-11</a>
        <a href="mailto:bki-91@yandex.ru">bki-91@yandex.ru</a>
        <a href="/kontakty/">Адрес и контакты бюро →</a>
      </div>
      </div>`;
    document.body.append(dialog);
    const get = id => dialog.querySelector('#bki-contact-' + id);
    form = get('form');
    fields = form.elements;
    status = get('status'); result = get('result'); letter = get('letter'); mail = get('mail');
    submit = get('submit'); prepare = get('prepare'); contextBox = get('context');
    for (const [value, title] of services) fields.service.add(new Option(title, value));
    updateMode();
    dialog.querySelector('.bki-contact-close').addEventListener('click', () => dialog.close());
    // Keep explicit Tab boundaries as well as native modal/Escape behavior.
    dialog.addEventListener('keydown', keepTabInDialog);
    dialog.addEventListener('close', () => {
      document.body.classList.remove('bki-contact-open');
      updateViewport();
      if (!document.querySelector('dialog[open]') && canFocus(opener)) opener.focus({ preventScroll: true });
    });
    let startedOutside = false;
    const outside = event => {
      const box = dialog.getBoundingClientRect();
      return event.target === dialog && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom);
    };
    dialog.addEventListener('pointerdown', event => { startedOutside = outside(event); });
    dialog.addEventListener('click', event => {
      if (startedOutside && outside(event)) dialog.close();
      startedOutside = false;
    });
    form.addEventListener('input', event => {
      if (typeof event.target.setCustomValidity === 'function') {
        event.target.setCustomValidity('');
        event.target.removeAttribute('aria-invalid');
      }
      invalidateLetter();
    });
    fields.service.addEventListener('change', () => {
      serviceManuallySelected = true;
      invalidateLetter(); renderContext();
    });
    form.addEventListener('submit', submitForm);
    prepare.addEventListener('click', () => { if (!busy && validate()) prepareLetter(); });
    get('copy').addEventListener('click', async () => {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(letter.value);
        setStatus('Текст скопирован. Вставьте его в письмо на ' + EMAIL + '. Обращение ещё не отправлено.');
      } catch {
        letter.focus(); letter.select(); letter.setSelectionRange(0, letter.value.length);
        setStatus('Выделите и скопируйте текст в поле выше: Ctrl+C или «Копировать» в меню выделения. Отправьте его на ' + EMAIL + '.');
      }
    });
    mail.addEventListener('click', () => setStatus('Открываем почтовую программу. Проверьте и отправьте письмо в ней. Сайт не может подтвердить отправку.'));
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    window.addEventListener('resize', updateViewport);
  }

  function canFocus(element) {
    return element instanceof HTMLElement && element.isConnected && !element.closest('dialog:not([open]), [hidden], [inert]') && element.getClientRects().length > 0;
  }

  function keepTabInDialog(event) {
    if (!dialog.open || event.key !== 'Tab' || event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey) return;
    const stops = [...dialog.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter(element => {
      if (!(element instanceof HTMLElement) || !element.isConnected || element.tabIndex < 0
        || element.matches(':disabled, [aria-disabled="true"]')
        || element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility === 'visible' && style.opacity !== '0'
        && [...element.getClientRects()].some(rect => rect.width > 0 && rect.height > 0);
    }).sort((a, b) => {
      // Positive tabindex, if ever added, precedes the ordinary DOM tab order.
      const left = a.tabIndex > 0 ? a.tabIndex : Number.MAX_SAFE_INTEGER;
      const right = b.tabIndex > 0 ? b.tabIndex : Number.MAX_SAFE_INTEGER;
      return left - right;
    });
    const index = stops.indexOf(document.activeElement);
    if (!stops.length) {
      event.preventDefault();
      dialog.querySelector('#bki-contact-title').focus({ preventScroll: true });
    } else if (index === -1 || (event.shiftKey ? index === 0 : index === stops.length - 1)) {
      event.preventDefault();
      // Allow the scrollable body to reveal the last link when cycling backwards.
      stops[event.shiftKey ? stops.length - 1 : 0].focus();
    }
  }

  function updateViewport() {
    if (!dialog?.open) return;
    const viewport = window.visualViewport;
    dialog.style.setProperty('--bki-contact-vh', (viewport?.height || window.innerHeight) + 'px');
    dialog.style.setProperty('--bki-contact-top', (viewport?.offsetTop || 0) + 'px');
  }

  function config() {
    const raw = window.BKI_CONTACT_CONFIG || {};
    return { endpoint: typeof raw.endpoint === 'string' ? raw.endpoint.trim() : '', timeoutMs: Math.min(60000, Math.max(1000, Number(raw.timeoutMs) || 15000)) };
  }

  function updateMode() {
    const server = Boolean(config().endpoint);
    submit.textContent = busy ? 'Отправляем…' : (server ? 'Отправить обращение' : 'Подготовить письмо');
    prepare.hidden = !server;
    dialog.querySelector('#bki-contact-mode').textContent = server
      ? 'Кнопка «Отправить обращение» передаст указанные данные в бюро. Можно также подготовить письмо и отправить его самостоятельно.'
      : 'Подготовим письмо с вашей задачей. Останется отправить его через свою почту или скопировать текст. Черновик хранится до перезагрузки страницы.';
    for (const note of document.querySelectorAll('[data-contact-delivery-note]')) {
      note.textContent = server
        ? 'Обращение можно передать через форму или подготовить письмо для отправки через свою почту.'
        : 'Подготовим письмо с вашей задачей. Останется отправить его через свою почту или скопировать текст. Черновик хранится до перезагрузки страницы.';
    }
  }

  function setStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }

  function invalidateLetter() {
    result.hidden = true;
    letter.value = '';
    mail.href = 'mailto:' + EMAIL;
    if (!busy) setStatus('');
  }

  function resolveProject(id, title) {
    const data = Array.isArray(window.BKI_PROJECTS) ? window.BKI_PROJECTS.find(item => item.id === id) : null;
    if (data) return clean(data.title + (data.code ? ' (' + data.code + ')' : ''));
    if (title) return clean(title);
    if (pathId(location.pathname, 'proekty') === id) return clean(document.querySelector('main h1')?.textContent);
    const card = [...document.querySelectorAll('[data-project-id]')].find(item => item.dataset.projectId === id);
    return clean(card?.querySelector('h3')?.textContent);
  }

  function renderContext() {
    const parts = [];
    if (fields.service.value !== 'help') parts.push('Направление: ' + fields.service.selectedOptions[0].textContent);
    if (context.project) parts.push(context.projectTitle ? 'Проект: ' + context.projectTitle : 'Страница проекта: /proekty/' + context.project + '/');
    contextBox.textContent = (resumingDraft ? 'Продолжаем черновик. ' : '')
      + (parts.length ? parts.join(' · ') : 'Общее обращение — без выбранного проекта.');
    contextBox.hidden = false;
  }

  function applyContext(options) {
    if (busy) return; // A request already in flight keeps its original context.
    const hasService = own(options, 'service');
    const hasProject = own(options, 'project');
    const nextProject = hasProject ? projectId(options.project) : context.project;
    resumingDraft = !hasService && !hasProject && Boolean(context.project || fields.service.value !== 'help'
      || fields.name.value || fields.contact.value || fields.message.value);
    // Reopening the same CTA preserves the user's selected direction as a draft.
    // A different contextual CTA still applies its new service/project.
    const requestKey = JSON.stringify([
      hasService ? serviceId(options.service) || 'help' : null,
      hasProject ? nextProject : null
    ]);
    const repeated = requestKey === lastContextRequest;
    if (hasService || hasProject) lastContextRequest = requestKey;
    const before = fields.service.value + '|' + context.project + '|' + context.projectTitle;
    if (hasService && !repeated) {
      fields.service.value = serviceId(options.service) || 'help';
      serviceManuallySelected = false;
    } else if (!hasService && hasProject && !serviceManuallySelected && (nextProject !== context.project || !nextProject)) {
      // A new project is a new task: don't carry an automatically chosen service.
      fields.service.value = 'help';
    }
    if (hasProject) {
      context.project = nextProject;
      context.projectTitle = context.project ? resolveProject(context.project, options.projectTitle) : '';
    } else if (hasService) {
      context = { project: '', projectTitle: '' };
    }
    if (before !== fields.service.value + '|' + context.project + '|' + context.projectTitle) invalidateLetter();
    renderContext();
  }

  function open(options = {}) {
    if (!options || typeof options !== 'object') options = {};
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => open(options), { once: true });
      return true;
    }
    createDialog();
    if (typeof dialog.showModal !== 'function') return false;
    const projectDialog = document.querySelector('#project-dialog');
    const request = { ...options };
    if (projectDialog?.open) {
      const detail = projectDialog.querySelector('#dialog-detail');
      const id = detail ? projectId(pathId(new URL(detail.href, location.href).pathname, 'proekty')) : '';
      if (!own(request, 'project') && id) {
        request.project = id;
        request.projectTitle = projectDialog.querySelector('#dialog-title')?.textContent;
      }
      pendingOpen = request;
      // Wait for the gallery's own close/focus handlers before showing the next modal.
      projectDialog.addEventListener('close', () => queueMicrotask(() => {
        const latest = pendingOpen;
        pendingOpen = null;
        if (!latest) return;
        const restored = document.activeElement;
        if (canFocus(restored) && restored !== document.body && !projectDialog.contains(restored)) latest.opener = restored;
        else latest.opener = [...document.querySelectorAll('[data-project]')].find(item => item.dataset.project === latest.project) || document.querySelector('.menu-toggle');
        show(latest);
      }), { once: true });
      projectDialog.close();
      return true;
    }
    if (pendingOpen) { pendingOpen = request; return true; }
    if (document.querySelector('dialog[open]:not(#contact-dialog)')) return false;
    show(request);
    return true;
  }

  function show(options) {
    applyContext(options);
    if (dialog.open) return;
    opener = options.opener instanceof HTMLElement ? options.opener : document.activeElement;
    const nav = document.querySelector('#main-nav');
    const toggle = document.querySelector('.menu-toggle');
    if (toggle?.getAttribute('aria-expanded') === 'true') {
      if (nav?.contains(opener)) opener = toggle;
      nav?.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Открыть меню');
    }
    if (!canFocus(opener) || opener === document.body) opener = document.querySelector('main .button, main a[href="#contacts"], .header-contact, .menu-toggle');
    updateMode();
    document.body.classList.add('bki-contact-open');
    dialog.showModal();
    updateViewport();
    dialog.querySelector('.bki-contact-body').scrollTop = 0;
    // Focusing the title avoids raising a phone keyboard before the user is ready.
    dialog.querySelector('#bki-contact-title').focus({ preventScroll: true });
    conversion('contact_open');
  }

  function isEmail(reply) {
    const parts = reply.match(/^([^\s@]+)@([^\s@]+)$/);
    if (!parts) return false;
    const domain = parts[2];
    // URL supplies the browser's IDN conversion, but URL syntax is not an email domain.
    if (/[\/\\:?#%]/.test(domain)) return false;
    try {
      const hostname = new URL('https://' + domain + '/').hostname;
      const labels = hostname.split('.');
      return hostname.length <= 253 && labels.length > 1 && labels.every(label =>
        /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label));
    } catch {
      return false;
    }
  }

  function validate() {
    fields.name.value = fields.name.value.trim();
    fields.contact.value = fields.contact.value.trim();
    const reply = fields.contact.value;
    const normalizedPhone = reply.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-');
    const phone = /^[+\d\s().-]+$/.test(normalizedPhone) && /^\d{7,15}$/.test(normalizedPhone.replace(/\D/g, ''));
    const email = isEmail(reply);
    if (phone) fields.contact.value = normalizedPhone;
    fields.name.setCustomValidity(fields.name.value ? '' : 'Укажите ваше имя.');
    fields.contact.setCustomValidity(phone || email ? '' : 'Укажите один телефон (7–15 цифр) или email вида name@example.ru.');
    for (const field of [fields.name, fields.contact, fields.message]) {
      const valid = field.checkValidity();
      field.setAttribute('aria-invalid', String(!valid));
      if (!valid) {
        setStatus(field.validationMessage, true);
        field.focus(); field.reportValidity();
        return false;
      }
    }
    return true;
  }

  function payload() {
    return {
      name: fields.name.value.trim(), contact: fields.contact.value.trim(),
      service: fields.service.value, serviceTitle: fields.service.selectedOptions[0].textContent,
      project: context.project, projectTitle: context.projectTitle,
      message: fields.message.value.trim(),
      // Deliberately omit URL search/hash: these can contain personal tracking data.
      source: location.origin + location.pathname
    };
  }

  function prepareLetter(moveFocus = true) {
    const data = payload();
    const project = data.projectTitle || (data.project ? '/proekty/' + data.project + '/' : '');
    const subject = 'Обращение в БКИ: ' + data.serviceTitle;
    const body = `Здравствуйте!\n\nИмя: ${data.name}\nКонтакт для ответа: ${data.contact}\nНаправление: ${data.serviceTitle}${project ? '\nПроект: ' + project : ''}\n\n${data.message || 'Хочу обсудить задачу с бюро.'}\n\nСтраница обращения: ${data.source}`;
    letter.value = 'Кому: ' + EMAIL + '\nТема: ' + subject + '\n\n' + body;
    const href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    mail.hidden = href.length > 1800;
    mail.href = mail.hidden ? 'mailto:' + EMAIL : href;
    result.hidden = false;
    setStatus(mail.hidden
      ? 'Текст готов, но ещё не отправлен. Письмо длинное: скопируйте его и отправьте на ' + EMAIL + ', чтобы почтовая программа не обрезала текст.'
      : 'Письмо подготовлено, но ещё не отправлено. Откройте почтовую программу или скопируйте текст и отправьте на ' + EMAIL + '.');
    if (moveFocus && dialog.open) dialog.querySelector(mail.hidden ? '#bki-contact-copy' : '#bki-contact-mail').focus();
    conversion('contact_letter_prepared');
  }

  function setBusy(value) {
    busy = value;
    form.querySelector('fieldset').disabled = value;
    submit.disabled = value; prepare.disabled = value;
    form.setAttribute('aria-busy', String(value));
    if (value) submit.textContent = 'Отправляем…'; else updateMode();
  }

  async function submitForm(event) {
    event.preventDefault();
    if (busy || !validate()) return;
    const settings = config();
    if (!settings.endpoint) { prepareLetter(); return; }
    const data = payload();
    const conversionContext = { service: data.service, project: data.project };
    const fingerprint = JSON.stringify(data);
    if (fingerprint === acceptedFingerprint) {
      setStatus('Это обращение уже принято сервером. Повторно отправлять его не нужно.');
      return;
    }
    let endpoint;
    try {
      endpoint = new URL(settings.endpoint, location.href);
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
      if ((endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && local)) || endpoint.username || endpoint.password) throw new Error('invalid endpoint');
    } catch {
      prepareLetter(false);
      setStatus('Не удалось отправить: адрес обработчика не настроен корректно. Данные сохранены в форме; ниже подготовлено письмо для отправки через вашу почту.', true);
      conversion('contact_submit_error', conversionContext);
      return;
    }
    if (fingerprint !== lastFingerprint) {
      requestId = window.crypto?.randomUUID?.() || 'bki-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
      lastFingerprint = fingerprint;
    }
    invalidateLetter();
    setBusy(true);
    setStatus('Отправляем обращение. Можно закрыть окно: проверка ответа продолжится.');
    const controller = new AbortController();
    let timedOut = false;
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, settings.timeoutMs);
    try {
      const response = await fetch(endpoint.href, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ ...data, requestId }), signal: controller.signal,
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'error'
      });
      if (!response.ok) {
        const error = new Error('HTTP error'); error.httpStatus = response.status; throw error;
      }
      const receipt = await response.json();
      if (receipt?.accepted !== true) throw new Error('Acceptance not confirmed');
      acceptedFingerprint = fingerprint;
      setStatus('Обращение принято сервером. Доставка на почту бюро этим сообщением не подтверждается. Ваш текст сохранён в форме.');
      conversion('contact_submit_accepted', conversionContext);
    } catch (error) {
      prepareLetter(false);
      const reason = timedOut ? 'Сервер не ответил вовремя.'
        : error.httpStatus === 429 ? 'Сервер ограничил частоту обращений. Повторите позже.'
        : error.httpStatus ? 'Сервер вернул ошибку (' + error.httpStatus + ').'
        : 'Не удалось получить подтверждение от сервера.';
      setStatus(reason + ' Приём заявки не подтверждён; не исключено, что сервер успел её принять. Данные сохранены. Можно повторить запрос позже или использовать подготовленное письмо ниже.', true);
      conversion('contact_submit_error', conversionContext);
    } finally {
      window.clearTimeout(timer);
      setBusy(false);
    }
  }

  function contextFromUrl(url) {
    const options = {};
    if (url.searchParams.has('service')) options.service = url.searchParams.getAll('service').length === 1 ? serviceId(url.searchParams.get('service')) || 'help' : 'help';
    if (url.searchParams.has('project')) options.project = url.searchParams.getAll('project').length === 1 ? projectId(url.searchParams.get('project')) : '';
    return options;
  }

  function directContactClick(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    const link = event.target.closest?.('a[href]');
    if (!link) return;
    const href = link.getAttribute('href').trim();
    const name = /^tel:/i.test(href) ? 'contact_phone_click' : /^mailto:/i.test(href) ? 'contact_email_click' : '';
    if (!name) return;
    if (dialog?.contains(link)) { conversion(name); return; }
    // Direct links outside the contact dialog use their page/gallery, not a stale draft.
    let project = pathId(location.pathname, 'proekty');
    const detail = link.closest('#project-dialog')?.querySelector('#dialog-detail');
    if (detail) {
      try { project = pathId(new URL(detail.href, location.href).pathname, 'proekty'); } catch { project = ''; }
    }
    conversion(name, { service: serviceId(pathId(location.pathname, 'uslugi')), project });
  }

  function clickContact(event) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest?.('a[href], button[data-contact-open]');
    if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    let options = {};
    if (link.matches('a')) {
      let url;
      try { url = new URL(link.href, location.href); } catch { return; }
      if (url.origin !== location.origin || url.hash !== '#contacts') return;
      // A bare #contacts inherits location.search in link.href. That inherited
      // query describes the old page entry, not a newly selected gallery project.
      const rawHref = link.getAttribute('href').trim();
      options = rawHref.startsWith('#') ? {} : contextFromUrl(url);
      const action = /обсуд|написать|подготовить обращение|описать задачу|опишите задачу/i.test(link.textContent);
      if (!action && !own(options, 'service') && !own(options, 'project') && !link.hasAttribute('data-contact-open')) return;
    }
    if (link.dataset.service) options.service = serviceId(link.dataset.service) || 'help';
    if (link.dataset.contactProject) options.project = projectId(link.dataset.contactProject);
    if (!own(options, 'service') && !own(options, 'project')) {
      const project = projectId(pathId(location.pathname, 'proekty'));
      const service = serviceId(pathId(location.pathname, 'uslugi'));
      if (project) options.project = project;
      else if (service) options.service = service;
    }
    options.opener = link;
    if (open(options)) {
      event.preventDefault();
      // Capture prevents gallery contact handlers / card open handlers racing us.
      event.stopPropagation();
    }
  }

  function openFromUrl() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    const url = new URL(location.href);
    if (url.hash !== '#contacts' || (!url.searchParams.has('service') && !url.searchParams.has('project'))) return;
    open(contextFromUrl(url));
  }

  const handledEvents = new WeakSet();
  const requestedOpen = event => {
    if (handledEvents.has(event)) return;
    handledEvents.add(event);
    open(event.detail || {});
  };
  window.BKIContact = Object.freeze({ open });
  document.addEventListener('click', directContactClick, true);
  document.addEventListener('click', clickContact, true);
  document.addEventListener('bki:contact-open', requestedOpen);
  window.addEventListener('bki:contact-open', requestedOpen);
  window.addEventListener('hashchange', openFromUrl);
  window.addEventListener('popstate', openFromUrl);
  const init = () => { createDialog(); openFromUrl(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
