# PhotoSwipe 5.4.4 for BKI

This directory contains an unmodified subset of the official `photoswipe@5.4.4`
npm distribution, licensed under MIT. `LICENSE` retains the upstream notice.
`PROVENANCE.json` records the official tarball URL, verified npm SHA-512 integrity,
and SHA-256 hashes of all five upstream files. The archive had 82 entries; only
the explicitly named files were copied. No install scripts were run.

Runtime files: `photoswipe.esm.min.js` (54,270 bytes) and `photoswipe.css`.
`photoswipe.esm.js` is the readable reference build. `package.json` is retained
verbatim as upstream metadata; this flat subset is not an npm installation.

Official references checked:

- https://photoswipe.com/options/ — appendToEl, padding, translation, focus.
- https://photoswipe.com/data-sources/ — direct core, array source, srcset, msrc.
- https://photoswipe.com/caption/ — custom caption and underlying accessibility.
- https://photoswipe.com/events/ — change, initialization and destruction.
- https://photoswipe.com/adjusting-zoom-level/ — fit, zoom and original dimensions.
- https://github.com/dimsemenov/PhotoSwipe/tree/v5.4.4
- https://registry.npmjs.org/photoswipe/5.4.4

## Host integration

Load the root `gallery-viewer.js` as a classic deferred script. It installs:

```js
await window.BKIViewer.open({ images, index, title, trigger, onChange });
window.BKIViewer.close();
window.BKIViewer.isOpen;
```

`index` and `onChange(index)` are zero-based. The callback runs on the initial
selection and changes, with exceptions isolated from viewer cleanup. `open()`
resolves `true` when the viewer or fallback is still open, `false` for empty input
or a closed/superseded session. Invalid native-dialog setup rejects after cleanup.
Closing while resources are pending resolves promptly; late imports cannot reopen
the viewer. A 15-second resource timeout leaves the local fallback available.

The first open loads the local vendor CSS and root `gallery-viewer.css`, reusing
existing stylesheet links if present, and dynamically imports the minified core.
There are no runtime CDN requests. Preserve these relative file locations.

Each image takes `src`, `displaySrc`, `srcSet`, `width`, `height`, `thumbnail`,
`alt`, `credit`, `sourceUrl`, `drawing`. Original `src` is resolved against the
viewer script directory, never against a nested project page. Only same-origin
WebP assets distinct from the original are used for display. Responsive width
candidates above 1200 are excluded. Original width/height are retained for aspect
ratio and zoom geometry; they need not equal the optimized file dimensions.
Originals appear only as explicit “Открыть оригинал” links. Missing optimized
assets or dimensions leave a navigable fallback instead of loading originals.

The native `<dialog class="bki-viewer">` is appended to `document.body`, as a
sibling of the project dialog. It owns focus, close/Escape, controls and a single
caption area. PhotoSwipe's internal focus trap and keyboard actions are disabled;
the host viewer handles keys locally. The image region is fitted and clipped
between the measured controls and caption, including at zoom. Caption text occupies
up to two lines and becomes scrollable/keyboard focusable only when longer. The
credit itself is the source link; it shares a compact row with the original link,
both keeping 44px hit areas. All supplied text uses `textContent`/DOM APIs.

The dialog uses `100vw`. Its scoped `:has()` rule temporarily releases the site's
root `scrollbar-gutter: stable` reservation while open, reverting on native close.

Body inline overflow values and priorities are restored on close, then focus
returns to `trigger` (or the prior focused element). Parent integration must keep
alt/credit/source accessible in the underlying gallery as well, and synchronize
the carousel through `onChange`.

## Verification boundary

`SYNTAX_CHECK.log` records syntax-only checks of the adapter, both vendor JS
builds, and CSS parsing. No browser QA, touch/pinch device testing, Safari hardware
testing, HTML integration, commit or publication was performed by this task.
The parent owns browser QA, including nested dialogs, gesture coordinates,
responsive network selection, blocked-module fallback and rapid close/reopen.
