'use strict';
const vm = require('vm');
const { read, assert, assertEq, assertDeepEq } = require('./helpers');

const SOURCE = read('background.js');

function load(sites = {}, granted = []) {
  const storageData = { sites: JSON.parse(JSON.stringify(sites)) };
  const grantedSet = new Set(granted);
  let registered = [];
  let failNextRegister = false;
  let listener = null;
  let installedListener = null;
  let startupListener = null;
  let removedListener = null;

  let menuListener = null;
  const downloads = [];
  const chrome = {
    storage: {
      local: {
        get: async () => ({ sites: JSON.parse(JSON.stringify(storageData.sites || {})) }),
        set: async (obj) => { Object.assign(storageData, JSON.parse(JSON.stringify(obj))); },
        setAccessLevel: async () => undefined,
      },
      onChanged: { addListener() {} },
    },
    contextMenus: {
      removeAll: callback => callback(),
      create: () => undefined,
      onClicked: { addListener(fn) { menuListener = fn; } },
    },
    downloads: {
      download: async (opts) => { downloads.push(opts); return 1; },
    },
    scripting: {
      getRegisteredContentScripts: async () => registered.map(script => JSON.parse(JSON.stringify(script))),
      registerContentScripts: async (list) => {
        if (failNextRegister) { failNextRegister = false; throw new Error('simulated registration failure'); }
        registered.push(...list.map(script => JSON.parse(JSON.stringify(script))));
      },
      unregisterContentScripts: async ({ ids }) => {
        registered = registered.filter(script => !ids.includes(script.id));
      },
      updateContentScripts: async (list) => {
        registered = registered.map(script => {
          const update = list.find(entry => entry.id === script.id);
          return update ? { ...script, ...JSON.parse(JSON.stringify(update)) } : script;
        });
      },
    },
    permissions: {
      contains: async ({ origins }) => origins.every(origin => grantedSet.has(origin)),
      remove: async ({ origins }) => { origins.forEach(origin => grantedSet.delete(origin)); },
      getAll: async () => ({ origins: [...grantedSet] }),
      onRemoved: { addListener(fn) { removedListener = fn; } },
    },
    runtime: {
      id: 'quietblock-test-id',
      onMessage: { addListener(fn) { listener = fn; } },
      onInstalled: { addListener(fn) { installedListener = fn; } },
      onStartup: { addListener(fn) { startupListener = fn; } },
    },
  };

  const context = vm.createContext({
    chrome, URL, TextEncoder, crypto, console,
    Object, Array, Promise, Map, Set, Uint8Array, Error, String, RegExp, Number, JSON,
  });
  vm.runInContext(SOURCE, context, { filename: 'background.js' });

  function send(message) {
    return new Promise(resolve => {
      const sender = testSender || { id: 'quietblock-test-id' };
      const keep = listener(message, sender, response => resolve(response));
      if (keep !== true) resolve({ ok: false, error: 'listener did not stay open' });
    });
  }

  return {
    storageData, grantedSet, send, downloads,
    get registered() { return registered; },
    failNextRegister: () => { failNextRegister = true; },
    triggerMenu(info, tab) { if (menuListener) menuListener(info, tab); },
    setSender(sender) { testSender = sender; },
    listeners: { installedListener, startupListener, removedListener },
  };
}

// Content-script sender for download-image messages.
let testSender = null;

function waitFor(condition, ms = 500) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (condition()) return resolve();
      if (Date.now() - start > ms) return reject(new Error('timeout waiting for condition'));
      setTimeout(tick, 10);
    };
    tick();
  });
}

async function testHostValidation() {
  const env = load();
  const bad = [
    'example.com:8080', '[::1]', 'example.com.', 'exa_mple.com',
    'https://example.com', '', 'example .com', 'example.com/path',
  ];
  for (const host of bad) {
    const res = await env.send({ type: 'site-state', host });
    assertEq(res.ok, false, `invalid host must be rejected: ${host}`);
    assert(/hostname|port|path/i.test(res.error), `clear error for ${host}: ${res.error}`);
  }
  // Whitespace is not a supported hostname either.
  const spaced = await env.send({ type: 'site-state', host: 'News.Example.COM ' });
  assertEq(spaced.ok, false, 'whitespace host rejected');
}

async function testNormalizeAndState() {
  const env = load();
  const res = await env.send({ type: 'site-state', host: 'Example.COM' });
  assertDeepEq(res, { ok: true, enabled: false, dismiss: false, imageSave: false, count: 0 }, 'clean unknown host state');
}

async function testEnableFlow() {
  const env = load();
  const origin = '*://example.com/*';
  const before = await env.send({ type: 'enable-site', host: 'example.com' });
  assertEq(before.ok, false, 'enable without granted permission must fail');
  assert(/Website access was not granted/.test(before.error), 'permission error message');

  env.grantedSet.add(origin);
  const after = await env.send({ type: 'enable-site', host: 'Example.COM' });
  assertEq(after.ok, true, 'enable must succeed once permission is granted');
  assertEq(after.enabled, true, 'enabled true');
  assertEq(after.dismiss, false, 'dismiss defaults off');
  assertEq(after.imageSave, true, 'image save defaults on');
  assertEq(env.storageData.sites['example.com'].dismiss, false, 'stored dismiss off');
  assertEq(env.storageData.sites['example.com'].imageSave, true, 'stored imageSave on');

  assertEq(env.registered.length, 3, 'guard + indicator + image saver registered by default');
  const guard = env.registered.find(script => /^quietblock-guard-/.test(script.id));
  assert(guard, 'guard script registered');
  assertDeepEq(guard.matches, [origin], 'match pattern is hostname-only');
  assertEq(guard.allFrames, false, 'top-level frame only');
  assertEq(guard.persistAcrossSessions, true, 'persist across sessions');
  assertEq(guard.runAt, 'document_start', 'guard runs at document_start');
  assertEq(guard.world, 'MAIN', 'guard runs in MAIN world');
  assertDeepEq(guard.js, ['page-guard.js'], 'guard injects page-guard.js');

  const indicator = env.registered.find(script => /^quietblock-indicator-/.test(script.id));
  assert(indicator, 'indicator script registered');
  assertDeepEq(indicator.js, ['indicator.js'], 'indicator injects indicator.js');
  assertEq(indicator.world, 'ISOLATED', 'indicator in ISOLATED world');
  assertEq(indicator.runAt, 'document_idle', 'indicator at document_idle');

  const image = env.registered.find(script => /^quietblock-image-/.test(script.id));
  assert(image, 'image saver registered by default');
  assertDeepEq(image.js, ['image-saver.js'], 'image-saver injects image-saver.js');
  assertEq(image.world, 'ISOLATED', 'image-saver in ISOLATED world');
}

async function testDismissToggle() {
  const env = load();
  env.grantedSet.add('*://news.example.com/*');
  await env.send({ type: 'enable-site', host: 'news.example.com' });
  const on = await env.send({ type: 'set-dismiss', host: 'news.example.com', enabled: true });
  assertEq(on.ok, true, 'dismiss can be enabled');
  assertEq(on.dismiss, true, 'dismiss enabled');
  assertEq(env.registered.length, 4, 'guard + indicator + image + dismiss scripts');
  const dismiss = env.registered.find(script => /^quietblock-dismiss-/.test(script.id));
  assert(dismiss, 'dismiss script registered');
  assertEq(dismiss.runAt, 'document_idle', 'dismiss at document_idle');
  assertEq(dismiss.world, 'ISOLATED', 'dismiss in ISOLATED world');
  assertDeepEq(dismiss.js, ['dismiss.js'], 'dismiss injects dismiss.js');
  assertEq(env.storageData.sites['news.example.com'].dismiss, true, 'dismiss stored');

  const off = await env.send({ type: 'set-dismiss', host: 'news.example.com', enabled: false });
  assertEq(off.ok, true, 'dismiss can be disabled');
  assertEq(env.registered.length, 3, 'dismiss script removed again');
}

async function testDismissWithoutEnable() {
  const env = load();
  const res = await env.send({ type: 'set-dismiss', host: 'example.com', enabled: true });
  assertEq(res.ok, false, 'set-dismiss without enable must fail');
  assert(/Enable this website first/.test(res.error), 'clear error message');
}

async function testDisableAndPermissions() {
  const env = load();
  const origin = '*://disabled.example.com/*';
  env.grantedSet.add(origin);
  await env.send({ type: 'enable-site', host: 'disabled.example.com' });
  assert(env.grantedSet.has(origin), 'permission granted after enable');
  const res = await env.send({ type: 'disable-site', host: 'disabled.example.com' });
  assertEq(res.ok, true, 'disable succeeds');
  assertEq(res.enabled, false, 'disabled');
  assert(!env.grantedSet.has(origin), 'disable revokes the optional origin');
  assertEq(env.registered.length, 0, 'scripts unregistered');
  assertEq(Object.keys(env.storageData.sites).length, 0, 'site removed from storage');
}

async function testListSorted() {
  const env = load();
  for (const host of ['zebra.example.com', 'alpha.example.com']) env.grantedSet.add(`*://${host}/*`);
  await env.send({ type: 'enable-site', host: 'zebra.example.com' });
  await env.send({ type: 'enable-site', host: 'alpha.example.com' });
  const list = await env.send({ type: 'list-sites' });
  assertEq(list.ok, true, 'list works');
  assertDeepEq(list.sites.map(s => s.host), ['alpha.example.com', 'zebra.example.com'], 'sites sorted by host');
}

async function testReset() {
  const env = load();
  env.grantedSet.add('*://a.example.com/*');
  env.grantedSet.add('*://b.example.com/*');
  await env.send({ type: 'enable-site', host: 'a.example.com' });
  await env.send({ type: 'enable-site', host: 'b.example.com' });
  await env.send({ type: 'set-dismiss', host: 'b.example.com', enabled: true });
  const res = await env.send({ type: 'reset' });
  assertEq(res.ok, true, 'reset works');
  assertEq(res.count, 0, 'count zero');
  assertEq(env.grantedSet.size, 0, 'all optional origins revoked');
  assertEq(env.registered.length, 0, 'all scripts unregistered');
}

async function testRollbackOnRegistrationFailure() {
  const env = load();
  const origin = '*://rollback.example.com/*';
  env.grantedSet.add(origin);
  env.failNextRegister();
  const res = await env.send({ type: 'enable-site', host: 'rollback.example.com' });
  assertEq(res.ok, false, 'enable fails when registration fails');
  assert(!env.grantedSet.has(origin), 'permission revoked on failure for a fresh enable');
  assertEq(Object.keys(env.storageData.sites).length, 0, 'nothing persisted on failure');
}

async function testReconcileDropsRevokedSites() {
  const env = load(
    { 'kept.example.com': { dismiss: false }, 'gone.example.com': { dismiss: true } },
    ['*://kept.example.com/*']
  );
  env.listeners.installedListener();
  await waitFor(() => env.registered.length >= 1);
  const sites = env.storageData.sites;
  assert(sites['kept.example.com'], 'kept site stays');
  assert(!sites['gone.example.com'], 'revoked site dropped by reconcile');
  assertEq(env.registered.length, 3, 'guard + indicator + image for kept site');
}

async function testImageSaveToggle() {
  const env = load();
  env.grantedSet.add('*://pics.example.com/*');
  await env.send({ type: 'enable-site', host: 'pics.example.com' });
  assertEq(env.registered.length, 3, 'default: guard + indicator + image');

  const off = await env.send({ type: 'set-image-save', host: 'pics.example.com', enabled: false });
  assertEq(off.ok, true, 'image save can be turned off');
  assertEq(off.imageSave, false, 'imageSave false');
  assert(!env.registered.some(s => /^quietblock-image-/.test(s.id)), 'image saver script removed');
  assertEq(env.registered.length, 2, 'guard + indicator remain');

  const on = await env.send({ type: 'set-image-save', host: 'pics.example.com', enabled: true });
  assertEq(on.ok, true, 'image save can be turned back on');
  assertEq(env.registered.length, 3, 'image saver re-registered');
  // set-image-save must not touch the dismiss setting.
  await env.send({ type: 'set-dismiss', host: 'pics.example.com', enabled: true });
  const off2 = await env.send({ type: 'set-image-save', host: 'pics.example.com', enabled: false });
  assertEq(off2.dismiss, true, 'dismiss untouched by image toggle');
  assertEq(off2.imageSave, false, 'imageSave off');
}

async function testDownloadImageContentScript() {
  const env = load();
  env.grantedSet.add('*://images.example.com/*');
  await env.send({ type: 'enable-site', host: 'images.example.com' });
  env.setSender({ id: 'quietblock-test-id', tab: { url: 'https://images.example.com/page' } });

  const first = await env.send({ type: 'download-image', url: 'https://images.example.com/cat.png' });
  assertEq(first.ok, true, 'download accepted from enabled site');
  assertEq(env.downloads.length, 1, 'one download queued');
  assertEq(env.downloads[0].url, 'https://images.example.com/cat.png', 'correct url queued');

  // Cooldown: immediate second request is dropped (no double download).
  const second = await env.send({ type: 'download-image', url: 'https://images.example.com/dog.png' });
  assertEq(second.ok, true, 'second message still ok');
  assertEq(env.downloads.length, 1, 'cooldown prevents a duplicate download');

  // Untrusted sender (no tab) must be rejected.
  env.setSender({ id: 'quietblock-test-id' });
  const noTab = await env.send({ type: 'download-image', url: 'https://images.example.com/x.png' });
  assertEq(noTab.ok, false, 'no-tab sender rejected');
  assert(/needs a website tab/.test(noTab.error), 'clear tab error');

  // Non-http url rejected.
  env.setSender({ id: 'quietblock-test-id', tab: { url: 'https://images.example.com/page' } });
  await new Promise(resolve => setTimeout(resolve, 700)); // let cooldown expire
  const badUrl = await env.send({ type: 'download-image', url: 'file:///etc/passwd' });
  assertEq(badUrl.ok, false, 'non-http url rejected');
}

async function testContextMenuDownload() {
  const env = load();
  env.grantedSet.add('*://menu.example.com/*');
  await env.send({ type: 'enable-site', host: 'menu.example.com' });
  env.triggerMenu(
    { menuItemId: 'quietblock-image-menu.example.com', srcUrl: 'https://menu.example.com/a.jpg' },
    { url: 'https://menu.example.com/somefile' }
  );
  await waitFor(() => env.downloads.length === 1);
  assertEq(env.downloads[0].url, 'https://menu.example.com/a.jpg', 'context menu starts download');

  // Menu click for a disabled (not stored) host is ignored.
  env.triggerMenu(
    { menuItemId: 'quietblock-image-other.example.com', srcUrl: 'https://other.example.com/b.jpg' },
    { url: 'https://other.example.com/somefile' }
  );
  await new Promise(resolve => setTimeout(resolve, 50));
  assertEq(env.downloads.length, 1, 'disabled host menu click ignored');
}

async function testMalformedStorageIgnored() {
  const env = load({
    'ok.example.com': { dismiss: false },
    'bad host!': { dismiss: true },
    'nested.example.com': 'not-an-object',
  }, ['*://ok.example.com/*', '*://nested.example.com/*']);
  const res = await env.send({ type: 'list-sites' });
  assertDeepEq(res.sites.map(s => s.host), ['ok.example.com'], 'malformed entries are ignored');
}

async function testUnknownMessage() {
  const env = load();
  const res = await env.send({ type: 'no-such-message', host: 'example.com' });
  assertEq(res.ok, false, 'unknown message rejected');
  assert(/Unknown request/.test(res.error), 'unknown request error');
}

async function run() {
  await testHostValidation();
  await testNormalizeAndState();
  await testEnableFlow();
  await testDismissToggle();
  await testDismissWithoutEnable();
  await testDisableAndPermissions();
  await testListSorted();
  await testReset();
  await testRollbackOnRegistrationFailure();
  await testReconcileDropsRevokedSites();
  await testImageSaveToggle();
  await testDownloadImageContentScript();
  await testContextMenuDownload();
  await testMalformedStorageIgnored();
  await testUnknownMessage();
}

module.exports = { run, name: 'background.js unit tests (Chrome API stubs)', load };
