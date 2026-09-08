'use strict';
const $ = id => document.getElementById(id);
let busy = false;
let refreshNumber = 0;

function notify(message, error = false) {
  $('notice').textContent = message;
  $('notice').hidden = !message;
  $('notice').classList.toggle('error', error);
}

async function send(type, extra = {}) {
  const result = await chrome.runtime.sendMessage({ type, ...extra });
  if (!result?.ok) throw new Error(result?.error || 'Could not contact the extension.');
  return result;
}

function render(sites) {
  $('site-count').textContent = String(sites.length);
  $('empty-state').hidden = sites.length > 0;
  $('remove-all').disabled = busy || sites.length === 0;
  $('site-list').replaceChildren();
  for (const site of sites) {
    const row = document.createElement('li');
    const copy = document.createElement('div');
    copy.className = 'saved-site';
    const host = document.createElement('strong');
    host.textContent = site.host;
    const detail = document.createElement('small');
    detail.textContent = `Layout checks + green indicator on · Popup cleanup ${site.dismiss ? 'on (experimental)' : 'off'} · Image save ${site.imageSave !== false ? 'on' : 'off'}`;
    copy.append(host, detail);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove ${site.host}`);
    remove.disabled = busy;
    remove.addEventListener('click', () => runChange('disable-site', { host: site.host }, `${site.host} removed. Reload its open tabs to finish turning the helper off.`));
    row.append(copy, remove);
    $('site-list').append(row);
  }
}

async function refresh() {
  const sequence = ++refreshNumber;
  try {
    const result = await send('list-sites');
    if (sequence === refreshNumber) render(result.sites);
  } catch (error) { notify(error.message, true); }
}

async function runChange(type, extra, message) {
  if (busy) return;
  busy = true;
  document.querySelectorAll('#remove-all,.remove-button').forEach(button => { button.disabled = true; });
  try {
    await send(type, extra);
    notify(message);
  } catch (error) { notify(error.message, true); }
  finally { busy = false; await refresh(); }
}

$('remove-all').addEventListener('click', () => {
  if (!busy && window.confirm('Remove all saved sites and their website permissions? Reload open tabs afterward to fully turn the helper off.')) {
    runChange('reset', {}, 'All saved sites removed. Reload affected tabs to clear already-running code.');
  }
});
chrome.storage.onChanged.addListener((_changes, area) => { if (area === 'local') refresh(); });
refresh();
