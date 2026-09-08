'use strict';
const $ = id => document.getElementById(id);
const state = { tabId: null, host: null, enabled: false, dismiss: false, imageSave: true, busy: true, supported: false, needsReload: false };

async function send(type, extra = {}) {
  const response = await chrome.runtime.sendMessage({ type, host: state.host, ...extra });
  if (!response?.ok) throw new Error(response?.error || 'Extension did not respond. Close and reopen it.');
  return response;
}

function notify(text = '', error = false) {
  $('notice').textContent = text;
  $('notice').hidden = !text;
  $('notice').classList.toggle('error', error);
}

function render() {
  $('site-host').textContent = state.host || 'Open a website first';
  $('site-host').title = state.host || '';
  $('site-status').classList.toggle('is-on', state.enabled);
  $('status-copy').textContent = !state.supported ? 'NOT AVAILABLE HERE' : state.enabled ? 'ENABLED FOR THIS SITE' : 'OFF FOR THIS SITE';
  $('guard-state').textContent = state.enabled ? 'ON' : 'OFF';
  $('guard-state').classList.toggle('is-on', state.enabled);
  $('dismiss-toggle').setAttribute('aria-checked', String(state.dismiss));
  $('dismiss-toggle').disabled = state.busy || !state.enabled || !state.supported;
  $('image-toggle').setAttribute('aria-checked', String(state.imageSave));
  $('image-toggle').disabled = state.busy || !state.enabled || !state.supported;
  $('main-action').disabled = state.busy || !state.supported;
  $('main-action').classList.toggle('secondary-button', state.enabled);
  $('main-action').textContent = state.busy ? 'One moment…' : !state.supported ? 'Not available on this page' : state.enabled ? 'Turn off & reload' : 'Enable & reload';
  $('reload-disclaimer').hidden = !state.supported;
  $('reload-action').hidden = !state.needsReload;
  $('reload-action').disabled = state.busy;
  if (!state.supported) {
    $('hero-title').textContent = 'Start with a regular website.';
    $('hero-description').textContent = 'Browser settings, extension stores and built-in pages cannot be protected.';
  } else if (state.enabled) {
    $('hero-title').textContent = 'A quieter visit starts here.';
    $('hero-description').textContent = 'The helper is enabled on this hostname. Keep uBlock turned on as usual.';
  } else {
    $('hero-title').textContent = 'Keep the blocker. Skip the nagging.';
    $('hero-description').textContent = 'A little help with common adblock checks, only on the sites you choose.';
  }
}

async function reloadTab() {
  try {
    await chrome.tabs.reload(state.tabId);
    state.needsReload = false;
    notify('Page reloaded. If the warning stays, this site may use a different check.');
  } catch {
    state.needsReload = true;
    notify('Setting saved. Refresh the website manually to apply it.', true);
  }
}

$('main-action').addEventListener('click', async () => {
  if (state.busy || !state.supported) return;
  state.busy = true;
  notify();
  render();
  try {
    if (!state.enabled) {
      // Request only this hostname, directly from the user's button click.
      const granted = await chrome.permissions.request({ origins: [`*://${state.host}/*`] });
      if (!granted) {
        notify('Website permission was declined. Nothing was enabled.');
        return;
      }
      const result = await send('enable-site');
      state.enabled = result.enabled;
      state.dismiss = result.dismiss;
      state.imageSave = result.imageSave !== false;
    } else {
      const result = await send('disable-site');
      state.enabled = result.enabled;
      state.dismiss = result.dismiss;
    }
    await reloadTab();
  } catch (error) {
    notify(error.message, true);
    try { Object.assign(state, await send('site-state')); } catch { /* Keep last known state. */ }
  } finally {
    state.busy = false;
    render();
  }
});

$('dismiss-toggle').addEventListener('click', async () => {
  if (state.busy || !state.enabled) return;
  state.busy = true;
  notify();
  render();
  try {
    const result = await send('set-dismiss', { enabled: !state.dismiss });
    state.dismiss = result.dismiss;
    state.needsReload = true;
    notify('Popup setting saved. Reload to apply it.');
  } catch (error) { notify(error.message, true); }
  finally { state.busy = false; render(); }
});

$('image-toggle').addEventListener('click', async () => {
  if (state.busy || !state.enabled) return;
  state.busy = true;
  notify();
  render();
  try {
    const result = await send('set-image-save', { enabled: !state.imageSave });
    state.imageSave = result.imageSave !== false;
    state.needsReload = true;
    notify('Image-save setting saved. Reload to apply it.');
  } catch (error) { notify(error.message, true); }
  finally { state.busy = false; render(); }
});

$('reload-action').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true;
  render();
  await reloadTab();
  state.busy = false;
  render();
});
$('manage-sites').addEventListener('click', () => chrome.runtime.openOptionsPage());

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const url = new URL(tab?.url || 'about:blank');
    const store = url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) ||
      (url.hostname === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons'));
    state.supported = ['http:', 'https:'].includes(url.protocol) && !store;
    if (state.supported) {
      state.tabId = tab.id;
      state.host = url.hostname;
      const result = await send('site-state');
      state.enabled = result.enabled;
      state.dismiss = result.dismiss;
      state.imageSave = result.imageSave !== false;
    }
  } catch (error) { notify(error.message, true); }
  finally { state.busy = false; render(); }
}
initialize();
