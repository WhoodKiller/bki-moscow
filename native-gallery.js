/* Native scroll-snap: touch inertia, vertical scroll and pinch remain browser-owned. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.BKIGallery = api;
    const init = () => { api.initCards(document, root.BKI_PROJECTS || []); api.initProjectPages(document); };
    if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const clampIndex = (i, n) => Math.max(0, Math.min(n - 1, Number.isFinite(i) ? Math.round(i) : 0));
  const nearestIndex = (left, width, n) => width > 0 ? clampIndex(left / width, n) : 0;
  const assetURL = src => src && !/^(?:https?:|data:|\/)/.test(src) ? '/' + src : src;
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (cls, text, label) => {
    const node = make('button', cls, text); node.type = 'button';
    if (label) node.setAttribute('aria-label', label);
    return node;
  };
  function sourceLink(picture, target) {
    target.replaceChildren();
    if (picture.sourceUrl && /^https?:\/\//.test(picture.sourceUrl)) {
      const source = make('a', '', picture.credit || 'Источник фотографии');
      source.href = picture.sourceUrl; source.target = '_blank'; source.rel = 'noopener'; target.append(source);
    } else target.textContent = picture.credit || '';
    target.hidden = !target.textContent;
  }
  function createCarousel(host, { images, title = 'Проект БКИ', initialIndex = 0, card = false,
    existingImage = null, href = null, projectId = null, onChange = () => {}, onActivate = null,
    immediate = false, sizes = '(max-width: 980px) calc(100vw - 48px), 800px' } = {}) {
    if (!images?.length) return null;
    let current = clampIndex(initialIndex, images.length), targetIndex = current;
    let destroyed = false, visible = immediate, raf = 0, scrollTimer = 0, suppressClickUntil = 0, pointer = null;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = navigator.connection;
    const saveData = connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType || '');
    const timers = new Set(), removers = [];
    const listen = (node, event, listener, options) => {
      node.addEventListener(event, listener, options);
      removers.push(() => node.removeEventListener(event, listener, options));
    };
    host.classList.add('bki-gallery'); host.classList.toggle('bki-gallery--card', card);
    host.classList.toggle('bki-gallery--single', images.length === 1);
    host.setAttribute('role', 'group'); host.setAttribute('aria-label', 'Фотографии: ' + title);
    const viewport = make('div', 'bki-carousel');
    viewport.setAttribute('aria-roledescription', 'карусель'); viewport.setAttribute('aria-label', 'Фотографии — можно листать');
    const bar = make('div', 'bki-gallery-bar');
    const hint = make('span', 'bki-gallery-hint', images.length > 1 ? 'Листайте фото' : 'Фото проекта');
    const counter = make('span', 'bki-gallery-count mono'); counter.setAttribute('aria-hidden', 'true');
    const previous = button('bki-gallery-arrow', '←', 'Предыдущее изображение');
    const next = button('bki-gallery-arrow', '→', 'Следующее изображение');
    previous.hidden = next.hidden = images.length < 2; bar.append(hint, previous, counter, next);
    const progress = make('div', 'bki-gallery-progress'); progress.setAttribute('aria-hidden', 'true');
    progress.append(make('span')); progress.hidden = images.length < 2;
    const status = make('p', 'sr-only'); status.setAttribute('role', 'status'); status.setAttribute('aria-atomic', 'true');
    const caption = make('p', 'bki-gallery-caption'), credit = make('p', 'photo-credit bki-gallery-credit');
    const original = make('a', 'bki-gallery-original', 'Оригинал ↗'); original.target = '_blank'; original.rel = 'noopener';
    const footer = make('div', 'bki-gallery-footer'); footer.append(credit, original);
    const thumbs = make('div', 'bki-gallery-thumbs'); thumbs.setAttribute('aria-label', 'Выбрать фотографию');
    thumbs.hidden = card || images.length < 2;
    const thumbButtons = [];
    const slides = images.map((picture, index) => {
      const slide = make('div', 'bki-slide'); slide.setAttribute('role', 'group');
      slide.setAttribute('aria-roledescription', 'слайд'); slide.setAttribute('aria-label', `${index + 1} из ${images.length}`);
      const open = href ? make('a', 'bki-slide-open card-gallery-open') : button('bki-slide-open' + (card ? ' card-gallery-open' : ''));
      if (href) open.href = href;
      if (projectId) open.dataset.project = projectId;
      open.dataset.imageIndex = String(index);
      open.setAttribute('aria-label', card ? 'Смотреть фотографии: ' + title : `Увеличить фото ${index + 1}: ${picture.alt}`);
      const image = index === 0 && existingImage ? existingImage : make('img');
      image.alt = picture.alt || title; image.width = picture.width || image.width || 1000;
      image.height = picture.height || image.height || 625; image.decoding = 'async'; image.draggable = false;
      open.append(image);
      if (!card) { const zoom = make('span', 'bki-zoom-label', 'Увеличить ↗'); zoom.setAttribute('aria-hidden', 'true'); open.append(zoom); }
      const pending = make('span', 'bki-slide-pending', 'Загружаем фото…'); pending.setAttribute('aria-hidden', 'true');
      const error = make('div', 'bki-slide-error'); error.hidden = true; error.append(make('span', '', 'Фото не загрузилось'));
      const retry = button('bki-gallery-retry', 'Повторить загрузку'); error.append(retry);
      slide.append(open, pending, error); viewport.append(slide);
      const state = { slide, open, image, pending, error, retry, picture, started: false, ready: false, timer: 0, attempt: 0 };
      state.cancelTimer = () => { clearTimeout(state.timer); timers.delete(state.timer); state.timer = 0; };
      listen(image, 'load', () => {
        if (destroyed || !image.naturalWidth) return;
        state.ready = true; state.cancelTimer();
        slide.dataset.state = 'ready'; pending.hidden = error.hidden = true; open.removeAttribute('aria-busy');
      });
      state.failed = (attempt = state.attempt) => {
        if (destroyed || state.ready || attempt !== state.attempt) return;
        state.cancelTimer();
        slide.dataset.state = 'error'; pending.hidden = true; error.hidden = false; open.removeAttribute('aria-busy');
      };
      listen(image, 'error', () => state.failed());
      listen(retry, 'click', () => {
        state.cancelTimer(); state.ready = false;
        open.focus({ preventScroll: true }); image.removeAttribute('srcset'); image.removeAttribute('src');
        state.started = false; ensure(index, false);
      });
      if (onActivate) listen(open, 'click', event => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); onActivate(index, open);
      });
      if (!card && images.length > 1) {
        const thumb = button('bki-gallery-thumb', undefined, `Фото ${index + 1}: ${picture.alt}`);
        if (picture.thumbnail) {
          const mini = make('img'); mini.alt = ''; mini.loading = 'lazy'; mini.decoding = 'async';
          mini.width = 160; mini.height = Math.round(160 * (picture.height || 625) / (picture.width || 1000));
          mini.src = assetURL(picture.thumbnail); thumb.append(mini);
        } else thumb.textContent = String(index + 1);
        listen(thumb, 'click', () => select(index)); thumbs.append(thumb); thumbButtons.push(thumb);
      }
      return state;
    });
    host.replaceChildren(viewport, progress, bar, status);
    if (!card) host.append(thumbs, caption, footer);
    function ensure(index, neighbour = false) {
      const item = slides[index]; if (!item || destroyed || item.started) return;
      item.cancelTimer(); const attempt = ++item.attempt;
      item.started = true; item.ready = false; item.pending.hidden = false; item.error.hidden = true;
      item.slide.dataset.state = 'loading'; item.open.setAttribute('aria-busy', 'true');
      const image = item.image, picture = item.picture;
      image.loading = 'eager'; image.fetchPriority = neighbour ? 'low' : 'auto'; image.sizes = sizes;
      if (picture.srcSet) image.srcset = picture.srcSet;
      const src = assetURL(picture.displaySrc || picture.src);
      if (image.getAttribute('src') !== src) image.src = src;
      if (image.complete && image.naturalWidth) {
        item.ready = true; item.pending.hidden = true; item.slide.dataset.state = 'ready'; item.open.removeAttribute('aria-busy');
      } else { item.timer = setTimeout(() => item.failed(attempt), 20000); timers.add(item.timer); }
    }
    function loadNearby() {
      if (!visible || destroyed) return;
      ensure(current);
      if (!saveData && images.length > 1) { ensure(current + 1, true); if (current > 0) ensure(current - 1, true); }
    }
    function update(index, notify = true) {
      const oldIndex = current;
      const focusFollows = oldIndex !== index && slides[oldIndex]?.slide.contains(document.activeElement);
      current = clampIndex(index, images.length); const picture = images[current];
      counter.textContent = `${String(current + 1).padStart(2, '0')} / ${String(images.length).padStart(2, '0')}`;
      previous.disabled = current === 0; next.disabled = current === images.length - 1;
      progress.firstElementChild.style.width = `${(current + 1) / images.length * 100}%`;
      host.dataset.imageIndex = String(current);
      slides.forEach((item, i) => {
        const active = i === current; item.open.tabIndex = active ? 0 : -1; item.retry.tabIndex = active ? 0 : -1;
        item.slide.setAttribute('aria-hidden', String(!active));
      });
      if (focusFollows && !pointer) slides[current].open.focus({ preventScroll: true });
      thumbButtons.forEach((thumb, i) => thumb.setAttribute('aria-pressed', String(i === current)));
      const thumb = thumbButtons[current];
      if (thumb && visible) {
        const left = thumb.offsetLeft;
        if (left < thumbs.scrollLeft) thumbs.scrollLeft = left;
        else if (left + thumb.offsetWidth > thumbs.scrollLeft + thumbs.clientWidth) thumbs.scrollLeft = left + thumb.offsetWidth - thumbs.clientWidth;
      }
      caption.textContent = picture.alt; sourceLink(picture, credit); original.href = assetURL(picture.src);
      status.textContent = `Фото ${current + 1} из ${images.length}: ${picture.alt}`;
      loadNearby(); if (notify) onChange(current);
    }
    function select(index, smooth = true) {
      if (destroyed) return;
      targetIndex = clampIndex(index, images.length); visible = true; ensure(targetIndex);
      viewport.scrollTo({ left: targetIndex * viewport.clientWidth, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
      if (!smooth || reducedMotion.matches || !viewport.clientWidth) update(targetIndex);
    }
    listen(previous, 'click', () => select(targetIndex - 1)); listen(next, 'click', () => select(targetIndex + 1));
    listen(viewport, 'scroll', () => {
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0; const index = nearestIndex(viewport.scrollLeft, viewport.clientWidth, images.length);
        if (index !== current) update(index);
      });
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => { targetIndex = nearestIndex(viewport.scrollLeft, viewport.clientWidth, images.length); }, 140);
    }, { passive: true });
    listen(viewport, 'pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) { pointer = null; return; }
      suppressClickUntil = 0; targetIndex = current;
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, left: viewport.scrollLeft, mouse: event.pointerType === 'mouse', dragging: false };
    }, { passive: true });
    listen(viewport, 'pointermove', event => {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      if (Math.hypot(dx, dy) > 8) suppressClickUntil = Date.now() + 700;
      if (!pointer.mouse) return; // Do not intercept any touch/pen movement.
      if (!pointer.dragging && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        pointer.dragging = true; viewport.classList.add('is-dragging'); viewport.setPointerCapture(event.pointerId);
      }
      if (pointer.dragging) { event.preventDefault(); viewport.scrollLeft = pointer.left - dx; }
    });
    function finishPointer(event) {
      if (!pointer || pointer.id !== event.pointerId) return;
      const dragged = pointer.dragging; pointer = null; viewport.classList.remove('is-dragging');
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
      if (dragged) { suppressClickUntil = Date.now() + 700; select(nearestIndex(viewport.scrollLeft, viewport.clientWidth, images.length)); }
    }
    listen(viewport, 'pointerup', finishPointer);
    listen(viewport, 'pointercancel', event => { suppressClickUntil = Date.now() + 700; finishPointer(event); });
    listen(viewport, 'lostpointercapture', finishPointer);
    listen(viewport, 'dragstart', event => event.preventDefault());
    listen(viewport, 'click', event => {
      if (event.detail !== 0 && Date.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
    listen(host, 'keydown', event => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      select(event.key === 'Home' ? 0 : event.key === 'End' ? images.length - 1 : targetIndex + (event.key === 'ArrowRight' ? 1 : -1));
    });
    const observer = typeof IntersectionObserver === 'function' && !immediate ? new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting); if (visible) loadNearby();
    }, { rootMargin: '200px 0px' }) : null;
    observer?.observe(host); if (!observer) visible = true;
    let lastWidth = 0;
    const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
      const width = viewport.clientWidth;
      if (width && width !== lastWidth) { lastWidth = width; viewport.scrollTo({ left: current * width, behavior: 'instant' }); }
    }) : null;
    resize?.observe(viewport); update(current);
    if (initialIndex) viewport.scrollLeft = current * viewport.clientWidth;
    return { select, step: delta => select(targetIndex + delta), getIndex: () => current,
      destroy() {
        destroyed = true; observer?.disconnect(); resize?.disconnect(); cancelAnimationFrame(raf); clearTimeout(scrollTimer);
        timers.forEach(clearTimeout); removers.forEach(remove => remove());
      }
    };
  }
  function initCards(document, projects) {
    const byId = new Map(projects.map(project => [project.id, project]));
    document.querySelectorAll('.project-card').forEach(card => {
      if (card.dataset.galleryEnhanced) return;
      const original = card.querySelector('.project-open');
      const project = byId.get(card.dataset.projectId || original?.dataset.project);
      const media = original?.querySelector('.project-media'), image = media?.querySelector('img');
      if (!project?.images?.length || !image) return;
      card.dataset.galleryEnhanced = 'true';
      const host = make('div', 'card-gallery'); original.before(host);
      const badge = media.querySelector('.project-badge');
      let carousel;
      carousel = createCarousel(host, { images: project.images, title: project.title, card: true, existingImage: image,
        href: original.tagName === 'A' ? original.href : null,
        projectId: original.tagName === 'A' ? null : project.id,
        sizes: '(max-width: 359px) calc(100vw - 34px), (max-width: 640px) calc(100vw - 42px), (max-width: 1368px) calc(46.8vw - 16px), 624px',
        onChange: index => { original.dataset.imageIndex = String(index); },
        onActivate: window.BKIViewer ? (index, trigger) => window.BKIViewer.open({ images: project.images, index, title: project.title,
          trigger, onChange: index => carousel.select(index, false) }) : null
      });
      media.remove();
      if (badge) { badge.classList.add('bki-gallery-badge'); host.querySelector('.bki-carousel').after(badge); }
    });
  }
  function initProjectPages(document) {
    if (!/^\/proekty\/[^/]+\//.test(location.pathname)) return;
    document.querySelectorAll('.project-gallery').forEach(host => {
      if (host.classList.contains('bki-gallery')) return;
      const figures = [...host.querySelectorAll(':scope > figure')];
      const images = figures.map(figure => {
        const img = figure.querySelector('img'), anchor = figure.querySelector('a'), source = figure.querySelector('.photo-source');
        if (!img || !anchor) return null;
        return { src: anchor.getAttribute('href'), displaySrc: img.getAttribute('src'), srcSet: img.getAttribute('srcset'),
          thumbnail: img.dataset.thumbnail, width: img.width, height: img.height, alt: img.alt,
          credit: source?.textContent, sourceUrl: source?.getAttribute('href') };
      }).filter(Boolean);
      if (!images.length || !window.BKIViewer) return;
      const title = document.querySelector('h1')?.textContent || 'Проект БКИ';
      let carousel;
      carousel = createCarousel(host, { images, title, existingImage: figures[0].querySelector('img'),
        onActivate: (index, trigger) => window.BKIViewer.open({ images, index, title, trigger, onChange: index => carousel.select(index, false) }) });
    });
  }
  return { clampIndex, nearestIndex, createCarousel, initCards, initProjectPages };
});
