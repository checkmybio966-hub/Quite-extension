(() => {
  'use strict';
  // Long-press (or click-and-hold) an image to save it with QuietBlock.
  // The background worker validates that this hostname is enabled and then
  // downloads via chrome.downloads (desktop: browser Downloads folder).
  const HOLD_MS = 650;
  let timer = null;

  function clearHold() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function nearestImage(target) {
    let el = target;
    while (el && !(el instanceof HTMLImageElement)) el = el.parentElement;
    return el;
  }

  function sourceOf(img) {
    return img.currentSrc || img.src || '';
  }

  function holdable(img) {
    const url = sourceOf(img);
    return /^https?:/i.test(url) && !/\.(svg|ico)$/i.test(url.split('?')[0]);
  }

  document.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const img = nearestImage(event.target);
    if (!img || !holdable(img)) return;
    clearHold();
    timer = setTimeout(async () => {
      timer = null;
      const url = sourceOf(img);
      if (!/^https?:/i.test(url)) return;
      try {
        await chrome.runtime.sendMessage({ type: 'download-image', url });
      } catch { /* popup closed or worker restarted; safe to ignore */ }
    }, HOLD_MS);
  }, true);

  for (const event of ['pointerup', 'pointercancel', 'pointerleave', 'scroll', 'touchmove']) {
    document.addEventListener(event, clearHold, true);
  }
  window.addEventListener('blur', clearHold, true);
})();
