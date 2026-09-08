'use strict';
const { JSDOM } = require('jsdom');
const { read, assert, assertEq, sleep } = require('./helpers');

function htmlFor(file) {
  // Strip local script tags; the script is injected manually with a chrome stub.
  return read(file).replace(/<script[^>]*><\/script>/g, '');
}

function makePopup(url, behaviors = {}) {
  const dom = new JSDOM(htmlFor('popup.html'), {
    url: 'chrome-extension://quietblock-id/popup.html',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  const calls = { reload: 0, request: 0, openedOptions: 0, sent: [] };
  let listSites = behaviors.siteState || { ok: true, enabled: false, dismiss: false, imageSave: true, count: 0 };

  w.chrome = {
    tabs: {
      query: async () => [{ id: 7, url }],
      reload: async () => { calls.reload += 1; },
    },
    permissions: {
      request: async () => { calls.request += 1; return true; },
    },
    runtime: {
      sendMessage: async message => {
        calls.sent.push(message);
        if (message.type === 'site-state') return listSites;
        if (message.type === 'enable-site') return { ok: true, enabled: true, dismiss: false, imageSave: true };
        if (message.type === 'disable-site') return { ok: true, enabled: false, dismiss: false, imageSave: true };
        if (message.type === 'set-dismiss') return { ok: true, enabled: true, dismiss: !!message.enabled, imageSave: true };
        if (message.type === 'set-image-save') return { ok: true, enabled: true, dismiss: false, imageSave: !!message.enabled };
        return { ok: false, error: 'unknown' };
      },
      openOptionsPage: async () => { calls.openedOptions += 1; },
    },
  };
  return { dom, w, d: w.document, calls, setSiteState: v => { listSites = v; } };
}

function makeOptions(sites) {
  const dom = new JSDOM(htmlFor('options.html'), {
    url: 'chrome-extension://quietblock-id/options.html',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  let listSites = sites;
  const calls = { sent: [] };
  w.confirm = () => true;
  w.chrome = {
    runtime: {
      sendMessage: async message => {
        calls.sent.push(message);
        if (message.type === 'list-sites') return { ok: true, sites: listSites };
        if (message.type === 'reset') { listSites = []; return { ok: true, count: 0 }; }
        return { ok: true };
      },
      openOptionsPage: async () => {},
    },
    storage: { onChanged: { addListener() {} } },
  };
  return { dom, w, d: w.document, calls };
}

async function waitUi(ms = 60) { await sleep(ms); }

async function testPopupEnableFlow() {
  const { w, d, calls } = makePopup('https://news.example.com/article?utm=1');
  w.eval(read('popup.js'));
  await waitUi();

  assertEq(d.getElementById('site-host').textContent, 'news.example.com', 'host shown without query');
  assertEq(d.getElementById('status-copy').textContent, 'OFF FOR THIS SITE', 'initial OFF state');
  assertEq(d.getElementById('guard-state').textContent, 'OFF', 'guard state OFF');
  assertEq(d.getElementById('main-action').textContent, 'Enable & reload', 'main action label');
  assert(!d.getElementById('main-action').disabled, 'main action enabled');
  assert(d.getElementById('dismiss-toggle').disabled, 'dismiss toggle disabled while site is off');

  d.getElementById('main-action').click();
  await waitUi();
  assertEq(calls.request, 1, 'permission requested on click');
  assertEq(calls.reload, 1, 'tab reloaded after enable');
  assertEq(d.getElementById('status-copy').textContent, 'ENABLED FOR THIS SITE', 'ENABLED after enable');
  assertEq(d.getElementById('guard-state').textContent, 'ON', 'guard state ON');
  assertEq(d.getElementById('main-action').textContent, 'Turn off & reload', 'action becomes disable');
  assert(!d.getElementById('dismiss-toggle').disabled, 'dismiss toggle enabled after enable');
  assert(!d.getElementById('image-toggle').disabled, 'image toggle enabled after enable');
  assertEq(d.getElementById('image-toggle').getAttribute('aria-checked'), 'true', 'image save on by default');

  // Optional popup cleanup: setting is local, page must reload to apply.
  d.getElementById('dismiss-toggle').click();
  await waitUi();
  assert(!d.getElementById('reload-action').hidden, 'reload-to-apply hint visible after dismiss change');

  // Image-save toggle sends set-image-save and asks for a reload too.
  d.getElementById('image-toggle').click();
  await waitUi();
  assert(calls.sent.some(m => m.type === 'set-image-save' && m.enabled === false), 'set-image-save sent');
  assertEq(d.getElementById('image-toggle').getAttribute('aria-checked'), 'false', 'image save toggled off');
  assert(!d.getElementById('reload-action').hidden, 'reload hint after image toggle');

  // Turn off.
  d.getElementById('main-action').click();
  await waitUi();
  assertEq(d.getElementById('status-copy').textContent, 'OFF FOR THIS SITE', 'OFF after disable');
}

async function testPopupUnsupportedPages() {
  {
    const { w, d } = makePopup('https://chromewebstore.google.com/detail/abc');
    w.eval(read('popup.js'));
    await waitUi();
    assertEq(d.getElementById('status-copy').textContent, 'NOT AVAILABLE HERE', 'web store unsupported');
    assert(d.getElementById('main-action').disabled, 'no action on web store');
  }
  {
    const { w, d } = makePopup('chrome://extensions/');
    w.eval(read('popup.js'));
    await waitUi();
    assertEq(d.getElementById('status-copy').textContent, 'NOT AVAILABLE HERE', 'browser page unsupported');
    assertEq(d.getElementById('site-host').textContent, 'Open a website first', 'no host shown off web');
  }
}

async function testPopupPermissionDeclined() {
  const { w, d, calls } = makePopup('https://declined.example.com');
  let approve = false;
  w.chrome.permissions.request = async () => {
    calls.request += 1;
    return approve;
  };
  w.eval(read('popup.js'));
  await waitUi();
  d.getElementById('main-action').click();
  await waitUi();
  assertEq(calls.request, 1, 'request attempted');
  assertEq(d.getElementById('status-copy').textContent, 'OFF FOR THIS SITE', 'site stays OFF when declined');
  assertEq(calls.reload, 0, 'no reload after decline');
}

async function testOptionsRenderAndReset() {
  const { w, d, calls } = makeOptions([
    { host: 'alpha.example.com', dismiss: false },
    { host: 'beta.example.com', dismiss: true },
  ]);
  w.eval(read('options.js'));
  await waitUi();

  assertEq(d.getElementById('site-count').textContent, '2', 'two sites listed');
  assertEq(d.querySelectorAll('.saved-site strong').length, 2, 'rows rendered');
  assert(d.getElementById('empty-state').hidden, 'empty state hidden when sites exist');
  assert(!d.getElementById('remove-all').disabled, 'remove-all enabled');

  d.getElementById('remove-all').click();
  await waitUi();
  assertEq(d.getElementById('site-count').textContent, '0', 'reset clears list');
  assert(!d.getElementById('empty-state').hidden, 'empty state shown after reset');
  assert(d.getElementById('remove-all').disabled, 'remove-all disabled after reset');
  assert(calls.sent.some(m => m.type === 'reset'), 'reset message sent');
}

async function run() {
  await testPopupEnableFlow();
  await testPopupUnsupportedPages();
  await testPopupPermissionDeclined();
  await testOptionsRenderAndReset();
}

module.exports = { run, name: 'popup.js / options.js UI tests (jsdom + chrome stubs)' };
