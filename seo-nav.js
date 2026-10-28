(() => {
  'use strict';
  const nav = document.querySelector('#main-nav');
  const menu = document.querySelector('.menu-toggle');
  if (!nav || !menu) return;
  function close() {
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
  nav.addEventListener('click', e => { if (e.target.closest('a')) close(); });
  document.addEventListener('click', e => { if (!e.target.closest('.site-header')) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { close(); menu.focus(); }
  });
  window.matchMedia('(min-width: 981px)').addEventListener('change', close);
})();
