/* BKI fullscreen viewer. Load as a classic script (defer is supported).
 * open({ images, index, title, trigger, onChange }) -> Promise<boolean>
 * true: viewer/fallback remains open; false: empty input or superseded/closed.
 * close() is immediate; isOpen includes the loading and fallback states.
 * CSS and PhotoSwipe core are local and loaded only on the first open.
 * Image width/height describe the ORIGINAL aspect ratio; only optimized
 * displaySrc/srcSet/thumbnail are passed to image loaders (never src).
 * Integration must retain image alt/credit on the underlying gallery too.
 * Official API: photoswipe.com/{options,data-sources,caption,events}/
 */
(() => {
  'use strict';

  const script = document.currentScript || [...document.scripts].find(node =>
    /(?:^|\/)gallery-viewer\.js(?:[?#]|$)/.test(node.src));
  const baseURL = new URL('.', script?.src || document.baseURI);
  const vendorURL = new URL('assets/vendor/photoswipe-5.4.4/', baseURL);
  const styleLoads = new Map();
  let moduleLoad;
  let active = null;
  let nextId = 0;

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function element(tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (value !== undefined) node.textContent = value;
    return node;
  }

  function assetURL(value) {
    if (!text(value)) return '';
    try {
      // Resolve assets/... against this script, including on /proekty/... pages.
      const url = new URL(value, baseURL);
      const assets = new URL('assets/', baseURL);
      if (!['http:', 'https:', 'file:'].includes(url.protocol) ||
          url.origin !== assets.origin || !url.pathname.startsWith(assets.pathname) ||
          url.username || url.password) return '';
      return url.href;
    } catch (_) {
      return '';
    }
  }

  function sourceURL(value) {
    try {
      const url = new URL(text(value));
      return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : '';
    } catch (_) {
      return '';
    }
  }

  function normalize(picture = {}, index) {
    const original = assetURL(picture.src);
    // An accidental original URL in displaySrc/srcSet must never trigger a download.
    const optimized = value => {
      const url = assetURL(value);
      if (!url) return '';
      const candidate = new URL(url);
      if (!/\.webp$/i.test(candidate.pathname)) return '';
      if (original && candidate.pathname === new URL(original).pathname) return '';
      return url;
    };
    const candidates = text(picture.srcSet).split(',').flatMap(part => {
      const match = part.trim().match(/^(\S+)\s+(\d+)w$/);
      if (!match) return [];
      const url = optimized(match[1]);
      const width = Number(match[2]);
      return url && width > 0 && width <= 1200 ? [{ url, width }] : [];
    }).sort((a, b) => a.width - b.width);
    const thumbnail = optimized(picture.thumbnail);
    const display = optimized(picture.displaySrc) || candidates.at(-1)?.url || thumbnail;
    const width = Number(picture.width);
    const height = Number(picture.height);
    const hasDimensions = Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
    return {
      original, display, thumbnail,
      srcset: candidates.map(item => `${item.url} ${item.width}w`).join(', '),
      width: hasDimensions ? width : 1,
      height: hasDimensions ? height : 1,
      hasDimensions,
      alt: text(picture.alt) || `Изображение ${index + 1}`,
      credit: text(picture.credit),
      source: sourceURL(picture.sourceUrl),
      drawing: Boolean(picture.drawing)
    };
  }

  function loadStyle(url) {
    const href = url.href;
    if (styleLoads.has(href)) return styleLoads.get(href);
    const promise = new Promise((resolve, reject) => {
      let link = [...document.querySelectorAll('link[rel="stylesheet"]')].find(node => {
        const present = new URL(node.href);
        return present.origin === url.origin && present.pathname === url.pathname;
      });
      if (link?.sheet) { resolve(); return; }
      const owned = !link;
      if (!link) {
        link = element('link');
        link.rel = 'stylesheet';
        link.href = href;
      }
      const finish = error => {
        clearTimeout(timer);
        link.removeEventListener('load', loaded);
        link.removeEventListener('error', failed);
        if (error) {
          if (owned) link.remove();
          reject(error);
        } else resolve();
      };
      const loaded = () => finish();
      const failed = () => finish(new Error('Не удалось загрузить стили просмотра'));
      const timer = setTimeout(failed, 15000);
      link.addEventListener('load', loaded, { once: true });
      link.addEventListener('error', failed, { once: true });
      if (owned) document.head.append(link);
    });
    styleLoads.set(href, promise);
    promise.catch(() => styleLoads.delete(href));
    return promise;
  }

  function loadCore() {
    if (!moduleLoad) {
      moduleLoad = import(new URL('photoswipe.esm.min.js', vendorURL).href);
      moduleLoad.catch(() => { moduleLoad = null; });
    }
    return moduleLoad;
  }

  function waitResources(session, resources) {
    return new Promise((resolve, reject) => {
      const signal = session.events.signal;
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', cancelled);
        if (error) reject(error);
        else resolve(value);
      };
      const cancelled = () => finish(null, null);
      const timer = setTimeout(() => finish(new Error('Истекло время загрузки просмотра')), 15000);
      signal.addEventListener('abort', cancelled, { once: true });
      resources.then(value => finish(null, value), error => finish(error));
      if (signal.aborted) cancelled();
    });
  }

  function current(session) {
    return active === session && !session.closed && session.dialog.open;
  }

  function listen(session, node, event, callback) {
    node.addEventListener(event, callback, { signal: session.events.signal });
  }

  function control(label, glyph) {
    const button = element('button', 'bki-viewer__button', glyph);
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    return button;
  }

  function link(label) {
    const anchor = element('a', 'bki-viewer__link', label);
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
  }

  function setLink(anchor, url) {
    anchor.hidden = !url;
    if (url) anchor.href = url;
    else anchor.removeAttribute('href');
  }

  function reportChange(session) {
    if (!current(session) || session.reportedIndex === session.index) return;
    session.reportedIndex = session.index;
    try {
      // The host carousel receives zero-based indices, including the initial one.
      const result = session.onChange?.(session.index);
      if (result && typeof result.catch === 'function') result.catch(error => console.error('BKIViewer onChange:', error));
    } catch (error) {
      console.error('BKIViewer onChange:', error);
    }
  }

  function updateZoom(session) {
    const slide = session.pswp?.currSlide;
    const zoomed = Boolean(slide && slide.currZoomLevel > slide.zoomLevels.initial + 0.01);
    session.zoom.disabled = !session.ready || !slide?.isZoomable();
    session.zoom.textContent = zoomed ? '−' : '+';
    const label = zoomed ? 'Уменьшить изображение' : 'Увеличить изображение';
    session.zoom.title = label;
    session.zoom.setAttribute('aria-label', label);
    session.zoom.setAttribute('aria-pressed', String(zoomed));
  }

  function previewSize(session, picture) {
    const width = session.dialog.clientWidth || document.documentElement.clientWidth;
    const height = (session.dialog.clientHeight || window.innerHeight) -
      (session.header.offsetHeight || 112) - (session.footer.offsetHeight || 130) - 16;
    const fitted = picture.hasDimensions ? height * picture.width / picture.height : width;
    return `${Math.max(1, Math.min(width - 24, fitted))}px`;
  }

  function render(session) {
    const picture = session.images[session.index];
    session.counter.textContent = `${session.index + 1} / ${session.images.length}`;
    session.counter.setAttribute('aria-label', `Изображение ${session.index + 1} из ${session.images.length}`);
    session.caption.textContent = picture.alt;
    session.credit.textContent = picture.credit;
    session.credit.hidden = !picture.credit || Boolean(picture.source);
    session.source.textContent = picture.credit || 'Источник изображения';
    session.source.setAttribute('aria-label', `${picture.credit || 'Источник изображения'} — открыть источник в новой вкладке`);
    session.kind.hidden = !picture.drawing;
    setLink(session.source, picture.source);
    setLink(session.original, picture.original);
    session.previous.disabled = session.index === 0;
    session.next.disabled = session.index === session.images.length - 1;
    session.dialog.classList.toggle('bki-viewer--drawing', picture.drawing);
    if (!session.ready) {
      session.preview.replaceChildren();
      if (picture.display) {
        const image = element('img', 'bki-viewer__preview-image');
        image.alt = picture.alt;
        image.decoding = 'async';
        // Set sizes before srcset/src, as required by responsive image loading.
        image.sizes = previewSize(session, picture);
        if (picture.srcset) image.srcset = picture.srcset;
        image.src = picture.display;
        image.addEventListener('error', () => {
          if (current(session) && !session.ready && image.isConnected) {
            session.status.textContent = 'Предпросмотр недоступен. Можно открыть оригинал по ссылке ниже.';
          }
        }, { once: true, signal: session.events.signal });
        session.preview.append(image);
      }
    }
    updateZoom(session);
    if (session.ready) scheduleLayout(session);
  }

  function layout(session) {
    if (!current(session)) return;
    session.dialog.style.setProperty('--bki-viewer-top', `${session.header.offsetHeight}px`);
    session.dialog.style.setProperty('--bki-viewer-bottom', `${session.footer.offsetHeight}px`);
    session.description.tabIndex = session.description.scrollHeight > session.description.clientHeight + 1 ? 0 : -1;
    if (session.ready) session.pswp.updateSize(true);
    else {
      const image = session.preview.querySelector('img');
      if (image) image.sizes = previewSize(session, session.images[session.index]);
    }
  }

  function scheduleLayout(session) {
    if (session.frame) return;
    session.frame = requestAnimationFrame(() => {
      session.frame = 0;
      layout(session);
    });
  }

  function step(session, delta) {
    if (!current(session)) return;
    if (session.ready) {
      // PhotoSwipe's potentialIndex handles rapid clicks while a swipe settles.
      if (delta > 0) session.pswp.next();
      else session.pswp.prev();
    } else {
      session.index = Math.max(0, Math.min(session.images.length - 1, session.index + delta));
      render(session);
      reportChange(session);
      layout(session);
    }
  }

  function disposeCore(session) {
    const pswp = session.pswp;
    session.pswp = null;
    session.ready = false;
    if (!pswp) return;
    try {
      pswp.destroy();
      // v5.4.4 destroy() otherwise returns early when init failed before open().
      // The version is pinned; finish partial initialization cleanup as well.
      if (!pswp.isDestroying) {
        pswp.isDestroying = true;
        pswp.destroy();
      }
    } catch (error) {
      pswp.events?.removeAll();
      pswp.element?.remove();
      console.error('BKIViewer cleanup:', error);
    }
  }

  function closeSession(session, restoreFocus = true, fromCore = false) {
    if (!session || session.closed) return;
    session.closed = true;
    if (active === session) active = null;
    session.events.abort();
    session.observer?.disconnect();
    if (session.frame) cancelAnimationFrame(session.frame);
    if (!fromCore) disposeCore(session);
    if (session.dialog.open) session.dialog.close();
    session.dialog.remove();
    // Preserve shorthand AND longhands/priorities (including overflow-x/y).
    for (const property of session.overflow) document.body.style.removeProperty(property.name);
    for (const property of session.overflow) {
      if (property.value) document.body.style.setProperty(property.name, property.value, property.priority);
    }
    if (restoreFocus) {
      const currentSlide = session.trigger?.closest('.bki-gallery')?.querySelector('.bki-slide[aria-hidden="false"] .bki-slide-open');
      const target = [currentSlide, session.trigger, session.previousFocus].find(node =>
        node?.isConnected && typeof node.focus === 'function' &&
        !node.closest('[inert], [hidden], [aria-hidden="true"], dialog:not([open])'));
      target?.focus({ preventScroll: true });
    }
  }

  function keyboard(session, event) {
    // This dialog is a sibling of #project-dialog, never its descendant.
    // Handle its keys locally; PhotoSwipe's document keyboard/trap are disabled.
    event.stopPropagation();
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeSession(session);
      return;
    }
    if (event.key === 'Tab') {
      const controls = [...session.dialog.querySelectorAll('button:not(:disabled), a[href], [tabindex]')]
        .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') &&
          !node.closest('[hidden], [inert], [aria-hidden="true"]') && node.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (!controls.includes(document.activeElement) ||
          (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus({ preventScroll: true });
      }
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      step(session, event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key.toLowerCase() === 'z' && session.ready) {
      event.preventDefault();
      session.pswp.toggleZoom();
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && session.ready &&
        !event.target.closest('.bki-viewer__description')) {
      const slide = session.pswp.currSlide;
      if (slide && slide.currZoomLevel > slide.zoomLevels.fit) {
        event.preventDefault();
        slide.panTo(slide.pan.x, slide.pan.y + (event.key === 'ArrowDown' ? -80 : 80));
      }
    }
  }

  function createSession(images, index, title, trigger, onChange) {
    const id = `bki-viewer-${++nextId}`;
    const dialog = element('dialog', 'bki-viewer');
    dialog.id = id;
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-help`);
    const header = element('header', 'bki-viewer__header');
    const heading = element('h2', 'bki-viewer__title', title || 'Просмотр изображений');
    heading.id = `${id}-title`;
    const counter = element('p', 'bki-viewer__counter');
    counter.setAttribute('aria-live', 'polite');
    counter.setAttribute('aria-atomic', 'true');
    const controls = element('div', 'bki-viewer__controls');
    const previous = control('Предыдущее изображение', '←');
    const next = control('Следующее изображение', '→');
    const zoom = control('Увеличить изображение', '+');
    const close = control('Закрыть просмотр', '×');
    close.classList.add('bki-viewer__close');
    close.autofocus = true;
    controls.append(previous, zoom, next, close);
    header.append(heading, counter, controls);

    const stage = element('div', 'bki-viewer__stage');
    const preview = element('div', 'bki-viewer__preview');
    const status = element('p', 'bki-viewer__status', 'Загрузка просмотра…');
    status.setAttribute('role', 'status');
    stage.append(preview, status);

    const footer = element('footer', 'bki-viewer__footer');
    const description = element('div', 'bki-viewer__description');
    description.tabIndex = 0;
    description.setAttribute('role', 'region');
    description.setAttribute('aria-label', 'Описание изображения');
    const kind = element('p', 'bki-viewer__kind', 'Проектная графика');
    const caption = element('p', 'bki-viewer__caption');
    const credit = element('p', 'bki-viewer__credit');
    const source = link('Источник');
    source.classList.add('bki-viewer__credit-link');
    const original = link('Открыть оригинал');
    const metadata = element('div', 'bki-viewer__metadata');
    original.classList.add('bki-viewer__original');
    original.setAttribute('aria-label', 'Открыть оригинал изображения в новой вкладке');
    source.setAttribute('aria-label', 'Источник изображения — открыть в новой вкладке');
    description.append(caption);
    metadata.append(credit, source, original);
    footer.append(kind, description, metadata);
    const help = element('p', 'bki-viewer__sr-only', 'Стрелки влево и вправо — переключить изображение. Z — изменить масштаб. Escape — закрыть. На сенсорном экране доступны смахивание и масштабирование двумя пальцами.');
    help.id = `${id}-help`;
    dialog.append(header, stage, footer, help);

    const session = {
      dialog, header, counter, previous, next, zoom, stage, preview, status,
      footer, description, kind, caption, credit, source, original, images, index, trigger,
      onChange: typeof onChange === 'function' ? onChange : null,
      previousFocus: document.activeElement,
      overflow: ['overflow', 'overflow-x', 'overflow-y'].map(name => ({
        name, value: document.body.style.getPropertyValue(name),
        priority: document.body.style.getPropertyPriority(name)
      })),
      events: new AbortController(), closed: false, ready: false, frame: 0,
      pswp: null, reportedIndex: -1
    };
    listen(session, close, 'click', () => closeSession(session));
    listen(session, previous, 'click', () => step(session, -1));
    listen(session, next, 'click', () => step(session, 1));
    listen(session, zoom, 'click', () => session.pswp?.toggleZoom());
    listen(session, dialog, 'cancel', event => {
      event.preventDefault();
      event.stopPropagation();
      closeSession(session);
    });
    listen(session, dialog, 'close', () => closeSession(session));
    listen(session, dialog, 'keydown', event => keyboard(session, event));
    listen(session, window, 'resize', () => scheduleLayout(session));
    if (window.visualViewport) listen(session, window.visualViewport, 'resize', () => scheduleLayout(session));
    if (typeof ResizeObserver === 'function') {
      session.observer = new ResizeObserver(() => scheduleLayout(session));
      [header, footer, dialog].forEach(node => session.observer.observe(node));
    }
    return session;
  }

  function initializeCore(session, PhotoSwipe) {
    if (session.images.some(picture => !picture.display || !picture.hasDimensions)) {
      throw new Error('Для жестов просмотра нужны оптимизированные изображения и корректные размеры');
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pswp = new PhotoSwipe({
      dataSource: session.images.map(picture => ({
        src: picture.hasDimensions ? picture.display : '',
        srcset: picture.hasDimensions ? picture.srcset : '',
        width: picture.width, height: picture.height, alt: picture.alt,
        msrc: picture.thumbnail || undefined,
        type: 'image'
      })),
      index: session.index,
      appendToEl: session.stage,
      mainClass: 'bki-viewer__pswp',
      bgOpacity: 1,
      loop: false,
      preload: [1, 1],
      getViewportSizeFn: () => ({ x: session.dialog.clientWidth, y: session.dialog.clientHeight }),
      paddingFn: () => ({
        top: session.header.offsetHeight + 8,
        bottom: session.footer.offsetHeight + 8,
        left: Math.max(12, parseFloat(getComputedStyle(session.header).paddingLeft) || 0),
        right: Math.max(12, parseFloat(getComputedStyle(session.header).paddingRight) || 0)
      }),
      // The native dialog owns focus, Escape and the persistent UI/fallback.
      trapFocus: false, returnFocus: false, escKey: false, arrowKeys: false,
      close: false, zoom: false, arrowPrev: false, arrowNext: false, counter: false,
      showHideAnimationType: 'none',
      zoomAnimationDuration: reduced ? 0 : 180,
      imageClickAction: 'zoom', tapAction: false, doubleTapAction: 'zoom',
      bgClickAction: false, clickToCloseNonZoomable: false,
      pinchToClose: false, closeOnVerticalDrag: false,
      closeTitle: 'Закрыть просмотр', zoomTitle: 'Изменить масштаб',
      arrowPrevTitle: 'Предыдущее изображение', arrowNextTitle: 'Следующее изображение',
      errorMsg: 'Изображение недоступно. Воспользуйтесь ссылкой «Открыть оригинал».',
      indexIndicatorSep: ' / '
    });
    session.pswp = pswp;
    // Avoid nested dialog roles; PhotoSwipe is the image region of our dialog.
    pswp.on('afterInit', () => {
      pswp.element.setAttribute('role', 'region');
      pswp.element.setAttribute('aria-label', 'Изображения проекта');
      pswp.scrollWrap.setAttribute('aria-roledescription', 'галерея');
    });
    pswp.on('change', () => {
      if (!current(session)) return;
      session.index = pswp.currIndex;
      if (session.ready) { render(session); reportChange(session); }
    });
    pswp.on('contentActivate', ({ content }) => {
      content.slide?.holderElement?.setAttribute('aria-roledescription', 'изображение');
    });
    pswp.on('zoomPanUpdate', () => updateZoom(session));
    pswp.on('loadComplete', () => updateZoom(session));
    pswp.on('destroy', () => {
      if (session.pswp === pswp && current(session)) closeSession(session, true, true);
    });
    if (!pswp.init()) throw new Error('Не удалось открыть PhotoSwipe');
    session.ready = true;
    session.preview.hidden = true;
    session.preview.replaceChildren();
    session.status.hidden = true;
    render(session);
    layout(session);
  }

  async function open({ images, index = 0, title = '', trigger = null, onChange } = {}) {
    if (!Array.isArray(images) || !images.length) return false;
    // Normalize before replacing the current session; do not mutate caller data.
    const pictures = images.map((picture, i) => normalize(picture || {}, i));
    const selected = Number.isFinite(Number(index)) ? Math.trunc(Number(index)) : 0;
    if (active) closeSession(active, false);
    const session = createSession(pictures, Math.max(0, Math.min(pictures.length - 1, selected)), text(title), trigger, onChange);
    active = session;
    document.body.append(session.dialog);
    document.body.style.setProperty('overflow', 'hidden', 'important');
    try {
      render(session);
      session.dialog.showModal();
      layout(session);
    } catch (error) {
      closeSession(session);
      throw error;
    }
    // No original image request is made while the module/styles are pending.
    const resources = Promise.all([
      loadCore(),
      loadStyle(new URL('photoswipe.css', vendorURL)),
      loadStyle(new URL('gallery-viewer.css', baseURL))
    ]);
    reportChange(session);
    try {
      const loaded = await waitResources(session, resources);
      if (!loaded || !current(session)) return false;
      const [module] = loaded;
      initializeCore(session, module.default);
    } catch (error) {
      if (!current(session)) return false;
      disposeCore(session);
      session.preview.hidden = false;
      session.status.hidden = false;
      session.status.textContent = 'Полноэкранные жесты недоступны. Можно листать изображения кнопками или открыть оригинал.';
      render(session);
      layout(session);
      console.warn('BKIViewer: используется локальный предпросмотр.', error);
    }
    return current(session);
  }

  window.BKIViewer = Object.freeze({
    open,
    close: () => closeSession(active),
    get isOpen() { return Boolean(active && !active.closed && active.dialog.open); }
  });
})();
