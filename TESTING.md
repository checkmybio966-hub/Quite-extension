# Validation status — v1.0.0

Har build ke saath yeh report update hoti hai. Yeh **honest status** hai; kuch
tests chale aur kuch nahi chal paye — niche clearly likha hai.

## Completed (automated, in this environment)

Commands: `npm install` (dev-only jsdom) then `npm test` → `tests/run.js`.

Result: **22/22 passed, 0 failed.**

1. **JavaScript syntax** — `node --check` on `background.js`, `page-guard.js`,
   `dismiss.js`, `popup.js`, `options.js` (all pass).
2. **Manifest / MV3 validation** — `manifest_version: 3`, version `1.0.0`,
   permissions exactly `activeTab, scripting, storage`, optional host
   permissions only (`http://*/*`, `https://*/*`), no unconditional
   `host_permissions`, no `tabs`/`webRequest`/`cookies`/`history`/`debugger`,
   CSP `script-src 'self'` without `unsafe-eval`, `incognito: not_allowed`,
   all referenced icons/HTML/CSS/JS files exist.
3. **Static safety scan** — no `fetch`, `XMLHttpRequest`, `WebSocket`,
   `eval`, `new Function`, `importScripts`, or remote URL literals in
   extension scripts.
4. **Background worker logic** (Node `vm` + Chrome API stubs) — hostname
   validation (rejects ports, paths, IPv6, trailing dot, spaces, underscores),
   enable/disable flow, per-hostname permission request/revoke, dynamic script
   registration (`document_start`/MAIN for guard, `document_idle`/ISOLATED for
   cleanup), `set-dismiss`, `list-sites` sorting, `reset`, rollback on
   registration failure, reconciliation of revoked permissions, malformed
   storage cleanup.
5. **DOM-hook logic** (`page-guard.js` in jsdom) — bait elements
   (`adsbox`, `ad-banner`, styled small slots) get masked
   dimensions/offsetParent/computed style; normal content and text-filled
   elements remain untouched.
6. **Popup cleanup** (`dismiss.js` in jsdom) — standalone adblock modal gets
   hidden and scroll lock removed; subscription/paywall dialog with adblock
   text is NOT hidden; password/login modal is NOT touched; a late-added modal
   is caught by the MutationObserver.
7. **Popup & options UI** (jsdom + chrome stubs) — enable/disable and reload
   flow, permission-declined behavior, web store/browser-page "not available"
   states, optional popup-cleanup toggle, image-save toggle, site-settings
   list rendering and Remove all.
8. **Green indicator** (`indicator.js`) — dot element injected once, styles
   (fixed, top-right, green, non-blocking) and no duplicate on re-inject.
9. **Long-press image save** (`image-saver.js`) — hold > threshold sends
   `download-image` with the image URL; quick tap / scroll / right-click
   do nothing; second image works.
10. **Background download handling** — content-script `download-image` accepted
    only from an enabled hostname via a real tab; duplicate cooldown; non-http
    URL rejected; context-menu click starts a download for enabled hosts and
    is ignored for disabled hosts; image-save toggle registers/unregisters the
    script without touching the popup-cleanup setting.

These jsdom-based tests are **not substitutes for real browser tests**.

## Not completed

- **Real browser load test (Chromium/Chrome/Edge)**: is environment mein koi
  browser binary available nahi tha (Chromium/Playwright/Chrome-for-Testing
  installs network se block the), aur shared-library wala browser launch
  environment bhi nahi mila. Isliye `chrome://extensions` → Load unpacked →
  popup open → page load karna **test nahi hua**.
- **torupload.com / upfiles.com live anti-adblock test**: maine aaj (2026-09-08)
  dono sites ke home pages fetch kiye (accessible, adblock-block nahi mila);
  `upfiles.com/jM8ys` aur `d.torupload.com/ueol1jxh5fzp` ab 404/expired hain,
  isliye detection/download-flow par **live verification nahi ho paya**.
  AdGuard issue reports (#83747 upfiles, #225758 d.torupload) confirm karte
  hain ki dono par adblock-detection hai — par koi v1.0.0 **verified bypass
  claim nahi** hai.
- **"All fake links auto-removed" claim**: koi bhi extension yeh reliably
  nahi kar sakti (server-side ad-delivery per site different hai). Yeh
  functionality deliberately **implement nahi ki**; iske bajaye uBlock filters
  + popup cleanup + honest UI note diya gaya hai.
- **uBlock Origin / uBlock Origin Lite integration**: dono ko enabled rakhte
  hue interference na ho, yeh bhi real-profile test mein nahi hua.
- **Edge-specific testing**: `edge://extensions`, Edge store page handling
  real Edge mein verify nahi hua.
- **Long-running stability / memory**: extensive page sessions aur popup
  cleanup ka sustained use test nahi hua.

## How to run the available checks

```bash
npm install        # dev-only: jsdom
npm test           # 16 checks
```

No browser profile, credentials, or real-site traffic is used by the harness.
