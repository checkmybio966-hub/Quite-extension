'use strict';

// All persistent changes go through this worker. Nothing is sent off-device.
const SCRIPT_PREFIX = 'quietblock-';
const MENU_PREFIX = 'quietblock-image-';
const DOWNLOAD_COOLDOWN_MS = 600;
let pending = Promise.resolve();
const lastDownload = new Map();

function serialize(work) {
  const result = pending.then(work);
  pending = result.catch(() => {});
  return result;
}

function normalizeHost(value) {
  if (typeof value !== 'string' || value.length > 253) {
    throw new Error('This is not a supported website hostname.');
  }
  const host = value.toLowerCase();
  // Plain hostnames / IPv4 labels only: no port, path, IPv6 brackets or
  // trailing dot, because Chrome match patterns have their own rules.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(host)) {
    throw new Error('Use a hostname without a port or path.');
  }
  const parsed = new URL(`https://${host}/`);
  if (parsed.hostname !== host || parsed.port || parsed.username || parsed.password) {
    throw new Error('Use a hostname without a port or path.');
  }
  return host;
}

const patternFor = host => `*://${host}/*`;

async function readSites() {
  const { sites = {} } = await chrome.storage.local.get('sites');
  const clean = Object.create(null);
  if (!sites || typeof sites !== 'object' || Array.isArray(sites)) return clean;
  for (const [key, settings] of Object.entries(sites)) {
    try {
      const host = normalizeHost(key);
      if (!settings || typeof settings !== 'object') continue;
      clean[host] = {
        dismiss: settings.dismiss === true,
        imageSave: settings.imageSave !== false, // default on
      };
    } catch { /* Ignore malformed local data. */ }
  }
  return clean;
}

async function scriptsFor(sites) {
  const scripts = [];
  for (const [host, settings] of Object.entries(sites)) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(host));
    const key = Array.from(new Uint8Array(digest)).map(n => n.toString(16).padStart(2, '0')).join('');
    const common = { matches: [patternFor(host)], allFrames: false, persistAcrossSessions: true };
    scripts.push({ ...common, id: `${SCRIPT_PREFIX}guard-${key}`, js: ['page-guard.js'], runAt: 'document_start', world: 'MAIN' });
    // Always-visible "this site is protected" indicator.
    scripts.push({ ...common, id: `${SCRIPT_PREFIX}indicator-${key}`, js: ['indicator.js'], runAt: 'document_idle', world: 'ISOLATED' });
    if (settings.dismiss) {
      scripts.push({ ...common, id: `${SCRIPT_PREFIX}dismiss-${key}`, js: ['dismiss.js'], runAt: 'document_idle', world: 'ISOLATED' });
    }
    if (settings.imageSave) {
      scripts.push({ ...common, id: `${SCRIPT_PREFIX}image-${key}`, js: ['image-saver.js'], runAt: 'document_idle', world: 'ISOLATED' });
    }
  }
  return scripts;
}

async function syncScripts(sites) {
  const wanted = await scriptsFor(sites);
  const desired = new Map(wanted.map(script => [script.id, script]));
  const existing = (await chrome.scripting.getRegisteredContentScripts()).filter(script => script.id.startsWith(SCRIPT_PREFIX));
  const oldIds = new Set(existing.map(script => script.id));
  const remove = existing.filter(script => !desired.has(script.id)).map(script => script.id);
  if (remove.length) await chrome.scripting.unregisterContentScripts({ ids: remove });
  const add = wanted.filter(script => !oldIds.has(script.id));
  if (add.length) await chrome.scripting.registerContentScripts(add);
  // Refresh registration settings after an extension update, without reinjecting
  // into an already-loaded page. All changes take full effect on page reload.
  const update = wanted.filter(script => oldIds.has(script.id));
  if (update.length) await chrome.scripting.updateContentScripts(update);
}

function syncMenus(sites, callback) {
  if (!chrome.contextMenus || !chrome.contextMenus.removeAll) {
    if (callback) callback();
    return;
  }
  chrome.contextMenus.removeAll(() => {
    for (const host of Object.keys(sites)) {
      try {
        chrome.contextMenus.create({
          id: `${MENU_PREFIX}${host}`,
          title: 'Save image with QuietBlock',
          contexts: ['image'],
          documentUrlPatterns: [patternFor(host)],
        });
      } catch { /* Duplicate ids are harmless; last write wins. */ }
    }
    if (callback) callback();
  });
}

async function commit(previous, next) {
  try {
    await syncScripts(next);
    await chrome.storage.local.set({ sites: next });
    syncMenus(next);
  } catch (error) {
    try { await syncScripts(previous); } catch (rollbackError) { console.warn('QuietBlock rollback:', rollbackError); }
    throw error;
  }
}

async function reconcile() {
  const sites = await readSites();
  for (const host of Object.keys(sites)) {
    if (!await chrome.permissions.contains({ origins: [patternFor(host)] })) delete sites[host];
  }
  await syncScripts(sites);
  await chrome.storage.local.set({ sites });
  syncMenus(sites);
}

async function downloadImage(url, host) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url) || url.length > 4096) {
    throw new Error('Only http(s) image URLs can be downloaded.');
  }
  const now = Date.now();
  const last = lastDownload.get(host) || 0;
  if (now - last < DOWNLOAD_COOLDOWN_MS) return { queued: false, reason: 'cooldown' };
  lastDownload.set(host, now);
  await chrome.downloads.download({ url, conflictAction: 'uniquify', saveAs: false });
  return { queued: true };
}

async function handle(message, sender = {}) {
  const sites = await readSites();
  if (message.type === 'list-sites') {
    return { sites: Object.entries(sites).map(([host, settings]) => ({ host, ...settings })).sort((a, b) => a.host.localeCompare(b.host)) };
  }
  if (message.type === 'reset') {
    await commit(sites, Object.create(null));
    const permissions = await chrome.permissions.getAll();
    const origins = (permissions.origins || []).filter(origin => /^(?:\*|https?):\/\//.test(origin));
    if (origins.length) await chrome.permissions.remove({ origins });
    return { count: 0 };
  }
  // From content scripts: sender.tab identifies the page.
  if (message.type === 'download-image') {
    const tabUrl = sender.tab && sender.tab.url;
    if (!tabUrl) throw new Error('Image saving needs a website tab.');
    const host = normalizeHost(new URL(tabUrl).hostname);
    if (!Object.hasOwn(sites, host)) throw new Error('Enable this website before saving images.');
    return await downloadImage(message.url, host);
  }

  const host = normalizeHost(message.host);
  const current = Object.hasOwn(sites, host) ? sites[host] : null;
  if (message.type === 'site-state') {
    const permitted = await chrome.permissions.contains({ origins: [patternFor(host)] });
    return {
      enabled: !!current && permitted,
      dismiss: !!current?.dismiss && permitted,
      imageSave: current?.imageSave !== false && permitted,
      count: Object.keys(sites).length,
    };
  }
  const next = Object.assign(Object.create(null), sites);
  if (message.type === 'enable-site') {
    if (!await chrome.permissions.contains({ origins: [patternFor(host)] })) {
      throw new Error('Website access was not granted. Please try enabling the site again.');
    }
    next[host] = current || { dismiss: false, imageSave: true };
    try {
      await commit(sites, next);
    } catch (error) {
      if (!current) await chrome.permissions.remove({ origins: [patternFor(host)] }).catch(() => {});
      throw error;
    }
    return { enabled: true, dismiss: next[host].dismiss, imageSave: next[host].imageSave !== false };
  }
  if (message.type === 'disable-site') {
    delete next[host];
    await commit(sites, next);
    await chrome.permissions.remove({ origins: [patternFor(host)] });
    return { enabled: false, dismiss: false, imageSave: true };
  }
  if (message.type === 'set-dismiss' || message.type === 'set-image-save') {
    if (!current) throw new Error('Enable this website first.');
    if (typeof message.enabled !== 'boolean') throw new Error('Invalid setting.');
    next[host] = { ...current, dismiss: message.type === 'set-dismiss' ? message.enabled : current.dismiss, imageSave: message.type === 'set-image-save' ? message.enabled : current.imageSave };
    await commit(sites, next);
    return { enabled: true, dismiss: next[host].dismiss, imageSave: next[host].imageSave !== false };
  }
  throw new Error('Unknown request.');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !message || typeof message.type !== 'string') return false;
  serialize(() => handle(message, sender)).then(
    data => sendResponse({ ok: true, ...data }),
    error => sendResponse({ ok: false, error: error.message || 'Something went wrong.' })
  );
  return true;
});

if (chrome.contextMenus && chrome.contextMenus.onClicked && chrome.contextMenus.onClicked.addListener) {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!info.menuItemId || !info.menuItemId.startsWith(MENU_PREFIX) || !info.srcUrl) return;
    const host = info.menuItemId.slice(MENU_PREFIX.length);
    serialize(async () => {
      const sites = await readSites();
      if (!Object.hasOwn(sites, host)) return;
      const tabUrl = tab && tab.url;
      if (tabUrl && normalizeHost(new URL(tabUrl).hostname) !== host) return;
      await downloadImage(info.srcUrl, host);
    }).catch(error => console.warn('QuietBlock image save:', error));
  });
}

chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' }).catch(console.warn);
const refresh = () => serialize(reconcile).catch(error => console.warn('QuietBlock setup:', error));
chrome.runtime.onInstalled.addListener(refresh);
chrome.runtime.onStartup.addListener(refresh);
chrome.permissions.onRemoved.addListener(refresh);
