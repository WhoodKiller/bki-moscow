/* Shared image state and progressively enhanced portfolio cards. No dependencies. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.BKIGallery = api;
    const init = () => api.initCards(document, root.BKI_PROJECTS || []);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  function abortError() {
    const error = new Error('Image request cancelled');
    error.name = 'AbortError';
    return error;
  }

  // A resolved result is the actual decoded image node, ready for an atomic DOM swap.
  // Existing lazy covers are observed without changing their src or loading priority.
  function waitForImage(image, { signal, src, timeoutMs = 30000 } = {}) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let decoding = false;
      let timer;
      const clean = () => {
        clearTimeout(timer);
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
        signal?.removeEventListener('abort', aborted);
      };
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clean();
        if (error) reject(error);
        else resolve(image);
      };
      const failed = () => finish(new Error('Image failed to load'));
      const aborted = () => {
        finish(abortError());
        // Only detached images created by loadImage are ours to cancel.
        if (src !== undefined) image.removeAttribute('src');
      };
      const loaded = async () => {
        if (settled || decoding) return;
        decoding = true;
        if (!image.naturalWidth) { failed(); return; }
        // Lazy covers have no network deadline before they enter the viewport.
        if (!timeoutMs) timer = setTimeout(() => finish(new Error('Image decode timed out')), 30000);
        try {
          if (typeof image.decode === 'function') await image.decode();
          if (!image.naturalWidth) throw new Error('Decoded image is empty');
          finish();
        } catch (error) { finish(error); }
      };
      image.addEventListener('load', loaded);
      image.addEventListener('error', failed);
      signal?.addEventListener('abort', aborted, { once: true });
      if (signal?.aborted) { aborted(); return; }
      if (timeoutMs) timer = setTimeout(() => finish(new Error('Image request timed out')), timeoutMs);
      if (src !== undefined) image.src = src;
      if (image.complete && (image.currentSrc || image.getAttribute('src'))) loaded();
    });
  }

  function loadImage(src, options = {}) {
    const ImageType = options.Image || globalThis.Image;
    const image = new ImageType();
    image.decoding = 'async';
    return waitForImage(image, { ...options, src });
  }

  function createController({ load = loadImage, render = () => {}, isActive = () => true } = {}) {
    let project = null;
    let version = 0;
    let pending = null;
    let state = Object.freeze({ status: 'closed', projectId: null, requestedIndex: 0, total: 0, frame: null, error: null });
    const publish = value => { state = Object.freeze(value); render(state); };
    const invalidate = () => { version++; pending?.abort(); pending = null; };
    async function select(index) {
      if (!project || !project.images.length) return false;
      invalidate();
      const requestVersion = version;
      const requestedProject = project;
      const total = project.images.length;
      const requestedIndex = ((index % total) + total) % total;
      const picture = Object.freeze({ ...project.images[requestedIndex] });
      const identity = { projectId: project.id, requestedIndex, total };
      const request = new AbortController();
      pending = request;
      publish({ ...identity, status: 'loading', frame: null, error: null });
      const current = () => version === requestVersion && project === requestedProject && isActive();
      try {
        const image = await load(picture.src, { signal: request.signal, projectId: project.id, index: requestedIndex });
        if (!current()) return false;
        pending = null;
        publish({ ...identity, status: 'ready', frame: Object.freeze({ ...picture, index: requestedIndex, image }), error: null });
        return true;
      } catch (error) {
        if (!current()) return false;
        pending = null;
        publish({ ...identity, status: 'error', frame: null, error });
        return false;
      }
    }
    return {
      open(value, index = 0) {
        invalidate();
        project = value;
        if (!project?.images?.length) { this.close(); return Promise.resolve(false); }
        return select(index);
      },
      select,
      step(delta) { return select(state.requestedIndex + delta); },
      retry() { return select(state.requestedIndex); },
      close() {
        invalidate();
        project = null;
        publish({ status: 'closed', projectId: null, requestedIndex: 0, total: 0, frame: null, error: null });
      },
      getState() { return state; }
    };
  }

  // A vertical decision locks for this gesture; a small diagonal movement is undecided.
  function createSwipeTracker() {
    let gesture = null;
    return {
      start(id, x, y) { gesture = { id, x, y, dx: 0, dy: 0, axis: null }; },
      move(id, x, y) {
        if (!gesture || gesture.id !== id) return null;
        gesture.dx = x - gesture.x;
        gesture.dy = y - gesture.y;
        const xDistance = Math.abs(gesture.dx), yDistance = Math.abs(gesture.dy);
        if (!gesture.axis && Math.max(xDistance, yDistance) >= 10) {
          if (yDistance >= xDistance) gesture.axis = 'vertical';
          else if (xDistance > yDistance * 1.25) gesture.axis = 'horizontal';
        }
        return gesture.axis;
      },
      end(id) {
        if (!gesture || gesture.id !== id) return null;
        const value = gesture;
        gesture = null;
        return {
          moved: Math.max(Math.abs(value.dx), Math.abs(value.dy)) >= 10,
          step: value.axis === 'horizontal' && Math.abs(value.dx) >= 40 ? (value.dx < 0 ? 1 : -1) : 0
        };
      },
      cancel() { const moved = Boolean(gesture); gesture = null; return moved; }
    };
  }

  function bindSwipe(surface, onStep) {
    const tracker = createSwipeTracker();
    let suppressClickUntil = 0;
    let pointer = null;
    surface.classList.add('gallery-swipe-surface');
    surface.addEventListener('dragstart', event => event.preventDefault());
    surface.addEventListener('pointerdown', event => {
      if (event.isPrimary === false) {
        tracker.cancel(); pointer = null; suppressClickUntil = Date.now() + 700; return;
      }
      if (event.button !== 0) return;
      suppressClickUntil = 0; // A fresh tap is never swallowed by the preceding swipe.
      pointer = event.pointerId;
      tracker.start(pointer, event.clientX, event.clientY);
    });
    surface.addEventListener('pointermove', event => {
      if (tracker.move(event.pointerId, event.clientX, event.clientY) === 'horizontal') {
        if (event.cancelable) event.preventDefault();
        if (!surface.hasPointerCapture?.(event.pointerId)) {
          try { surface.setPointerCapture(event.pointerId); } catch { /* Pointer may already be gone. */ }
        }
      }
    });
    surface.addEventListener('pointerup', event => {
      tracker.move(event.pointerId, event.clientX, event.clientY);
      const result = tracker.end(event.pointerId);
      if (!result) return;
      pointer = null;
      if (result.moved) suppressClickUntil = Date.now() + 700;
      if (result.step) onStep(result.step);
    });
    const cancel = event => {
      if (pointer !== event.pointerId) return;
      tracker.cancel(); pointer = null; suppressClickUntil = Date.now() + 700;
    };
    surface.addEventListener('pointercancel', cancel);
    surface.addEventListener('lostpointercapture', cancel);
    surface.addEventListener('pointerleave', event => {
      if (!surface.hasPointerCapture?.(event.pointerId)) cancel(event);
    });
    surface.addEventListener('click', event => {
      // Keyboard activation has detail=0 and remains available after any gesture.
      if (event.detail !== 0 && Date.now() < suppressClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
  }

  function initCards(document, projects) {
    const byId = new Map(projects.map(project => [project.id, project]));
    const make = (tag, className, text) => {
      const node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };
    document.querySelectorAll('.project-card').forEach(card => {
      if (card.dataset.galleryEnhanced) return;
      const original = card.querySelector('.project-open');
      const id = card.dataset.projectId || original?.dataset.project;
      const project = byId.get(id);
      const media = original?.querySelector('.project-media');
      let image = media?.querySelector('img');
      if (!project || project.images.length < 2 || !image) return;
      card.dataset.galleryEnhanced = 'true';
      const gallery = make('div', 'card-gallery');
      gallery.setAttribute('role', 'group');
      gallery.setAttribute('aria-label', 'Фотографии: ' + project.title);
      const open = make(original.tagName.toLowerCase(), 'card-gallery-open');
      if (original.tagName === 'A') open.href = original.href;
      else { open.type = 'button'; open.dataset.project = project.id; }
      open.setAttribute('aria-label', 'Открыть проект: ' + project.title);
      original.before(gallery);
      open.append(media);
      gallery.append(open);
      const controls = make('div', 'card-gallery-controls');
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', 'Выбор фотографии');
      const previous = make('button', 'card-gallery-arrow', '←');
      const next = make('button', 'card-gallery-arrow', '→');
      previous.setAttribute('aria-label', 'Предыдущее изображение');
      next.setAttribute('aria-label', 'Следующее изображение');
      const dots = make('div', 'card-gallery-dots');
      const counter = make('span', 'card-gallery-count mono');
      counter.setAttribute('aria-hidden', 'true');
      const status = make('div', 'card-gallery-status');
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      status.setAttribute('aria-atomic', 'true');
      const retry = make('button', 'card-gallery-retry', 'Повторить загрузку');
      retry.hidden = true;
      const buttons = project.images.map((picture, index) => {
        const button = make('button', 'card-gallery-dot');
        button.type = 'button';
        button.setAttribute('aria-label', `Изображение ${index + 1}: ${picture.alt}`);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => controller.select(index));
        dots.append(button);
        return button;
      });
      [previous, next, retry].forEach(button => { button.type = 'button'; });
      controls.append(previous, dots, next, counter);
      gallery.append(controls, status, retry);
      let observeCover = true;
      const controller = createController({
        load(src, options) {
          const url = new URL(src, new URL('/', document.baseURI)).href;
          if (observeCover && options.index === 0 && image.src === url) {
            observeCover = false;
            return waitForImage(image, { signal: options.signal, timeoutMs: 0 });
          }
          observeCover = false;
          return loadImage(url, options);
        },
        render(state) {
          const ready = state.status === 'ready';
          gallery.dataset.galleryState = state.status;
          open.setAttribute('aria-busy', String(state.status === 'loading'));
          if (state.status !== 'error' && document.activeElement === retry) {
            buttons[state.requestedIndex]?.focus({ preventScroll: true });
          }
          retry.hidden = state.status !== 'error';
          if (ready) {
            const nextImage = state.frame.image;
            nextImage.alt = state.frame.alt;
            nextImage.width = 1000; nextImage.height = 625;
            nextImage.draggable = false;
            if (nextImage !== image) { image.replaceWith(nextImage); image = nextImage; }
            card.classList.toggle('is-drawing', Boolean(state.frame.drawing));
            image.style.visibility = '';
            image.removeAttribute('aria-hidden');
            // Open the last fully displayed frame, never an in-flight selection.
            open.dataset.imageIndex = original.dataset.imageIndex = String(state.frame.index);
            counter.textContent = `${state.frame.index + 1} / ${state.total}`;
            status.textContent = `Изображение ${state.frame.index + 1} из ${state.total}: ${state.frame.alt}`;
          } else {
            image.style.visibility = 'hidden'; image.setAttribute('aria-hidden', 'true');
            counter.textContent = '';
            status.textContent = state.status === 'loading'
              ? `Загрузка изображения ${state.requestedIndex + 1} из ${state.total}…`
              : 'Не удалось загрузить изображение. Повторите попытку или выберите другое.';
          }
          status.classList.toggle('sr-only', ready);
          buttons.forEach((button, index) => {
            button.setAttribute('aria-pressed', String(ready && index === state.frame.index));
            button.classList.toggle('is-loading', state.status === 'loading' && index === state.requestedIndex);
          });
        }
      });
      previous.addEventListener('click', () => controller.step(-1));
      next.addEventListener('click', () => controller.step(1));
      retry.addEventListener('click', () => controller.retry());
      bindSwipe(open, delta => controller.step(delta));
      gallery.addEventListener('keydown', event => {
        if (event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault(); controller.step(event.key === 'ArrowRight' ? 1 : -1);
        }
      });
      controller.open(project);
    });
  }

  return { loadImage, waitForImage, createController, createSwipeTracker, bindSwipe, initCards };
});
