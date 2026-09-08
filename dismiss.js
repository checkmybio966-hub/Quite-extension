/* Optional, conservative popup cleanup. It does NOT satisfy a detector or
 * unlock content. Deliberately skips likely paywalls, login and payment UI. */
(() => {
  'use strict';
  const dismissed = new WeakSet();
  const selector = 'dialog,[role="dialog"],[aria-modal="true"],.modal,.popup,[id*="adblock" i],[class*="adblock" i],[id*="ad-block" i],[class*="ad-block" i]';
  const adblockWords = /\b(?:ad[\s-]?block(?:er|ers|ing)?|ublock|ads?\s+blocker)\b/i;
  const requestWords = /\b(?:disable|disabled|detected|turn\s+off|pause|allowlist|whitelist|deactivate|blocking)\b/i;
  const protectedWords = /\b(?:paywall|subscri(?:be|ber|bers|ption)|membership|premium|purchase|checkout|payment|password|sign[ -]?in|log[ -]?in|pay\s+to)\b/i;
  let scheduled = false;

  function visible(node) {
    if (!(node instanceof HTMLElement) || node.hidden || dismissed.has(node)) return false;
    const style = getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
  }

  function otherDialogOpen() {
    return Array.from(document.querySelectorAll('dialog[open],[role="dialog"],[aria-modal="true"]')).some(visible);
  }

  function scan() {
    scheduled = false;
    if (document.hidden) return;
    let changed = false;
    const candidates = Array.from(document.querySelectorAll(selector)).slice(0, 100);
    for (const node of candidates) {
      if (!visible(node) || /^(HTML|BODY|MAIN|ARTICLE|NAV|HEADER|FOOTER)$/.test(node.tagName)) continue;
      const explicitDialog = node.matches('dialog[open],[role="dialog"],[aria-modal="true"]');
      if (!explicitDialog && getComputedStyle(node).position !== 'fixed') continue;
      const text = (node.innerText || '').replace(/\s+/g, ' ').trim();
      if (text.length < 12 || text.length > 1400) continue;
      if (!adblockWords.test(text) || !requestWords.test(text) || protectedWords.test(text)) continue;
      if (node.querySelector('main,article,nav,form,iframe,video,audio,input[type="password"],input[type="email"]')) continue;
      // A semantic dialog or fixed adblock panel with explicit detection copy.
      dismissed.add(node);
      if (node instanceof HTMLDialogElement && node.open) node.close();
      node.style.setProperty('display', 'none', 'important');
      changed = true;
    }
    if (changed && !otherDialogOpen()) {
      // Only undo inline overflow locks. Do not remove layout classes or styles.
      for (const node of [document.documentElement, document.body]) {
        if (node && /^(hidden|clip)$/.test(node.style.overflow)) node.style.removeProperty('overflow');
      }
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(scan, 250);
  }
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['class', 'style', 'open', 'aria-hidden']
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  scan();
})();
