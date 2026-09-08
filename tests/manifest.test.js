'use strict';
const { read, exists, assert, assertEq, assertDeepEq, Failure } = require('./helpers');

function run() {
  const manifest = JSON.parse(read('manifest.json'));

  assertEq(manifest.manifest_version, 3, 'manifest_version must be 3 (MV3)');
  assertEq(manifest.version, '1.0.0', 'version must be 1.0.0');
  assert(typeof manifest.name === 'string' && manifest.name.length > 0, 'name missing');
  assert(typeof manifest.description === 'string', 'description missing');
  assert(typeof manifest.minimum_chrome_version === 'string' &&
    parseInt(manifest.minimum_chrome_version, 10) >= 120, 'minimum_chrome_version >= 120');

  // Minimal, explicit permissions. No telemetry-ish or broad APIs.
  assertDeepEq(
    [...(manifest.permissions || [])].sort(),
    ['activeTab', 'contextMenus', 'downloads', 'scripting', 'storage'],
    'permissions must be exactly activeTab, contextMenus, downloads, scripting, storage'
  );
  // Optional, per-hostname approval only - never granted at install time.
  assertDeepEq(
    [...(manifest.optional_host_permissions || [])].sort(),
    ['http://*/*', 'https://*/*'],
    'optional_host_permissions must be http/https wildcards only'
  );
  assert(!manifest.host_permissions, 'no unconditional host_permissions allowed');

  const forbidden = ['tabs', 'webRequest', 'webRequestBlocking', 'cookies', 'history', 'management', 'debugger'];
  for (const p of forbidden) {
    assert(!(manifest.permissions || []).includes(p), `forbidden permission: ${p}`);
  }

  assertEq(manifest.incognito, 'not_allowed', 'incognito must be not_allowed');
  assert(!manifest.externally_connectable, 'no externally_connectable');

  // Background worker wiring.
  assertEq(manifest.background && manifest.background.service_worker, 'background.js', 'service worker must be background.js');
  assert(exists('background.js'), 'background.js must exist');

  // Action + options.
  assert(manifest.action && manifest.action.default_popup === 'popup.html', 'action default_popup');
  assert(exists('popup.html') && exists('popup.js'), 'popup files must exist');
  assert(manifest.options_ui && manifest.options_ui.page === 'options.html', 'options_ui page');
  assert(exists('options.html') && exists('options.js'), 'options files must exist');

  // Icons.
  for (const size of ['16', '32', '48', '128']) {
    assert(manifest.icons && exists(`icons/icon${size}.png`), `icon ${size} must exist`);
    assert(manifest.action && manifest.action.default_icon && exists(`icons/icon${size}.png`),
      `action default icon ${size} must exist`);
  }

  // CSP: local scripts only, no remote code.
  const csp = manifest.content_security_policy && manifest.content_security_policy.extension_pages || '';
  assert(/script-src 'self'/.test(csp), "CSP script-src must be 'self'");
  assert(!/unsafe-eval/.test(csp) && !/unsafe-inline/.test(csp), 'CSP must not allow unsafe eval/inline');
  assert(!/https?:\/\//.test(csp), 'CSP must not allow remote sources');

  // Referenced assets inside HTML.
  const popupHtml = read('popup.html');
  const optionsHtml = read('options.html');
  assert(popupHtml.includes('ui.css'), 'popup.html references ui.css');
  assert(popupHtml.includes('popup.js'), 'popup.html references popup.js');
  assert(optionsHtml.includes('ui.css'), 'options.html references ui.css');
  assert(optionsHtml.includes('options.js'), 'options.html references options.js');
  assert(exists('ui.css'), 'ui.css must exist');
  assert(!/<script[^>]*\bsrc\s*=\s*["']https?:/i.test(popupHtml + optionsHtml), 'no remote scripts in HTML');

  // No remote code / network primitives in extension scripts (static scan).
  const scripts = ['background.js', 'page-guard.js', 'dismiss.js', 'indicator.js', 'image-saver.js', 'popup.js', 'options.js'];
  for (const file of scripts) {
    const src = read(file);
    assert(src.includes("'use strict'") || src.includes('"use strict"'), `${file} must be in strict mode`);
    for (const needle of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'new Function', 'eval(', 'importScripts(']) {
      if (src.includes(needle)) throw new Failure(`${file} uses forbidden primitive: ${needle}`);
    }
    // URL literals are only allowed when building a URL for hostname parsing
    // (new URL(...)) or in the *:// match-pattern helper. No remote endpoints.
    const remote = src.split('\n').filter(line =>
      /https?:\/\//.test(line) && !line.includes('new URL(') && !line.includes('*://')
    );
    if (remote.length) throw new Failure(`${file} contains remote URL(s): ${remote.join(' | ')}`);
  }
}

module.exports = { run, name: 'manifest & static safety checks' };
