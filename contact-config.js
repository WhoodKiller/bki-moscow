/* Public configuration only. Never put mail passwords, API keys or tokens here.
 * A configured endpoint must validate/rate-limit on the server and return
 * HTTP 2xx with JSON { "accepted": true } only after accepting the request.
 * See delivery-mobile-ux-20261106/CONTACT.txt for the integration contract. */
window.BKI_CONTACT_CONFIG = Object.assign({
  endpoint: '',
  timeoutMs: 15000
}, window.BKI_CONTACT_CONFIG || {});
