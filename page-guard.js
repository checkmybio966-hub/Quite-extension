/* QuietBlock: narrow, best-effort DOM bait protection; runs in the page world.
 * It does not unblock requests, change uBlock rules, or claim to be invisible.
 * No globals, remote scripts, network calls, or Function.toString spoofing.
 */
(() => {
  'use strict';
  const html = globalThis.HTMLElement?.prototype;
  const element = globalThis.Element?.prototype;
  if (!html || !element || typeof Proxy !== 'function') return;

  const apply = Reflect.apply;
  const nativeStyle = window.getComputedStyle;
  const nativeRect = element.getBoundingClientRect;
  const NativeRect = globalThis.DOMRect;
  const getAttribute = element.getAttribute;
  const styleValue = CSSStyleDeclaration.prototype.getPropertyValue;
  const baitTokens = new Set([
    'adsbox', 'adbox', 'ad-box', 'ad-banner', 'ad_banner', 'adbanner',
    'ad-test', 'ad_test', 'adtest', 'ads-test', 'ad-bait', 'ad_unit',
    'adblock', 'adblock-test', 'adblock_test', 'adblocktest',
    'adblock-bait', 'adblock-check', 'adblock-detect', 'adblock-detector',
    'adblock-detection', 'adblockdetector', 'ad-block-test',
    'text-ad', 'textad', 'text_ad', 'text_ads', 'text-ads', 'text-ad-links',
    'pub_300x250', 'pub_300x250m', 'pub_728x90', 'pub_970x250',
    'pub_300x600', 'pub_320x50', 'ad-unit-test', 'ad-banner-test'
  ]);
  const eligibleTags = new Set(['DIV', 'SPAN', 'INS', 'P', 'SECTION', 'ASIDE']);

  function isProbe(node) {
    try {
      if (!(node instanceof HTMLElement) || !node.isConnected || !eligibleTags.has(node.tagName)) return false;
      if (node.childElementCount !== 0) return false;
      const id = (apply(getAttribute, node, ['id']) || '').toLowerCase();
      const classes = (apply(getAttribute, node, ['class']) || '').toLowerCase().split(/\s+/);
      if (!baitTokens.has(id) && !classes.some(token => baitTokens.has(token))) return false;
      // Do not touch actual creative content, normal articles, or large slots.
      const text = (node.textContent || '').trim().toLowerCase();
      if (!['', '.', 'ad', 'ads', 'test'].includes(text)) return false;
      for (const axis of ['width', 'height']) {
        const value = apply(styleValue, node.style, [axis]).trim();
        if (/%|v[wh]|vmin|vmax|calc\(/i.test(value)) return false;
        if (/^-?[\d.]+px$/i.test(value) && parseFloat(value) > 64) return false;
      }
      return true;
    } catch { return false; }
  }

  function hint(node, axis) {
    const value = apply(styleValue, node.style, [axis]).trim();
    const parsed = /^\d+(?:\.\d+)?px$/.test(value) ? parseFloat(value) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.min(64, parsed)) : 1;
  }

  function patchGetter(prototype, name, transform) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor?.get || !descriptor.configurable) return;
    const original = descriptor.get;
    try {
      Object.defineProperty(prototype, name, {
        ...descriptor,
        get: function () {
          const value = apply(original, this, []); // Preserve native receiver errors.
          return isProbe(this) ? transform(value, this) : value;
        }
      });
    } catch { /* Frozen/tampered page prototypes: leave this check alone. */ }
  }

  for (const [name, axis] of [['offsetWidth', 'width'], ['offsetHeight', 'height']]) {
    patchGetter(html, name, (value, node) => value === 0 ? Math.round(hint(node, axis)) : value);
  }
  for (const [name, axis] of [
    ['clientWidth', 'width'], ['clientHeight', 'height'],
    ['scrollWidth', 'width'], ['scrollHeight', 'height']
  ]) {
    patchGetter(element, name, (value, node) => value === 0 ? Math.round(hint(node, axis)) : value);
  }
  patchGetter(html, 'offsetParent', (value, node) => value || node.ownerDocument.body || node.ownerDocument.documentElement);

  const rectDescriptor = Object.getOwnPropertyDescriptor(element, 'getBoundingClientRect');
  if (rectDescriptor?.configurable && NativeRect) {
    try {
      Object.defineProperty(element, 'getBoundingClientRect', {
        ...rectDescriptor,
        value: function getBoundingClientRect() {
          const rect = apply(nativeRect, this, []);
          if (!isProbe(this) || (rect.width > 0 && rect.height > 0)) return rect;
          return new NativeRect(rect.x, rect.y, rect.width || hint(this, 'width'), rect.height || hint(this, 'height'));
        }
      });
    } catch { /* Best effort only. */ }
  }

  function maskedProperty(style, node, key) {
    const actual = apply(styleValue, style, [key]);
    if (!isProbe(node)) return actual;
    if (key === 'display' && actual === 'none') return node.tagName === 'SPAN' ? 'inline-block' : 'block';
    if (key === 'visibility' && /^(hidden|collapse)$/.test(actual)) return 'visible';
    if (key === 'content-visibility' && actual === 'hidden') return 'visible';
    if ((key === 'width' || key === 'height') && (actual === 'auto' || parseFloat(actual) === 0)) return `${hint(node, key)}px`;
    return actual;
  }

  const mappedProperties = new Map([
    ['display', 'display'], ['visibility', 'visibility'],
    ['contentVisibility', 'content-visibility'], ['content-visibility', 'content-visibility'],
    ['width', 'width'], ['height', 'height']
  ]);
  const styleDescriptor = Object.getOwnPropertyDescriptor(window, 'getComputedStyle');
  if (styleDescriptor?.configurable) {
    try {
      Object.defineProperty(window, 'getComputedStyle', {
        ...styleDescriptor,
        value: function getComputedStyle(node, pseudo) {
          const style = apply(nativeStyle, this, arguments);
          if (!isProbe(node) || (pseudo != null && pseudo !== '')) return style;
          const bound = new Map();
          return new Proxy(style, {
            get(target, key) {
              if (mappedProperties.has(key)) return maskedProperty(target, node, mappedProperties.get(key));
              if (key === 'getPropertyValue') {
                if (!bound.has(key)) bound.set(key, function getPropertyValue(property) {
                  // Delegate invalid/missing arguments to the native API.
                  if (arguments.length === 0 || typeof property !== 'string') return apply(styleValue, target, arguments);
                  return maskedProperty(target, node, property);
                });
                return bound.get(key);
              }
              const value = Reflect.get(target, key, target);
              if (typeof value !== 'function') return value;
              if (!bound.has(key)) bound.set(key, value.bind(target));
              return bound.get(key);
            }
          });
        }
      });
    } catch { /* Some sites intentionally freeze browser APIs. */ }
  }
})();
