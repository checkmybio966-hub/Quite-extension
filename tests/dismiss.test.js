'use strict';
const { JSDOM } = require('jsdom');
const { read, assert, assertEq, sleep } = require('./helpers');

const SOURCE = read('dismiss.js');

function makeDom(extra = '') {
  const dom = new JSDOM(`<!doctype html>
<html><head></head><body>
  <div id="adblock-modal" class="modal" role="dialog" style="position:fixed">
    <p>Adblock detected! Please disable your adblocker to continue viewing this website.</p>
  </div>
  ${extra}
</body></html>`, { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  // jsdom has no layout, so give getClientRects a display-aware fake.
  Object.defineProperty(w.HTMLElement.prototype, 'getClientRects', {
    configurable: true,
    value() {
      const style = w.getComputedStyle(this);
      const hidden = style.display === 'none' || style.visibility === 'hidden';
      return hidden ? [] : [{ x: 0, y: 0, width: 10, height: 10 }];
    },
  });
  // jsdom does not implement innerText; approximate it for the test page.
  Object.defineProperty(w.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() {
      return (this.textContent || '').replace(/\s+/g, ' ').trim();
    },
  });
  return dom;
}

async function run() {
  // Scenario A: standalone adblock modal gets hidden, scroll lock lifted.
  {
    const dom = makeDom();
    const w = dom.window;
    const d = w.document;
    d.documentElement.style.overflow = 'hidden';
    d.body.style.overflow = 'hidden';
    w.eval(SOURCE);

    const modal = d.getElementById('adblock-modal');
    assertEq(modal.style.display, 'none', 'adblock modal hidden');
    assertEq(d.body.style.overflow, '', 'scroll lock removed');
  }

  // Scenario B: with a subscription dialog open, adblock modal is hidden but
  // the paywall-like dialog stays, and the scroll lock is not removed.
  {
    const dom = makeDom(`
      <div id="paywall-dialog" class="modal" role="dialog" style="position:fixed">
        <p>Adblock detected. Subscribe to continue reading this article.</p>
      </div>`);
    const w = dom.window;
    const d = w.document;
    d.documentElement.style.overflow = 'hidden';
    d.body.style.overflow = 'hidden';
    w.eval(SOURCE);

    const modal = d.getElementById('adblock-modal');
    const paywall = d.getElementById('paywall-dialog');
    assertEq(modal.style.display, 'none', 'adblock modal hidden even with paywall open');
    assertEq(paywall.style.display, '', 'subscription dialog untouched');
    assertEq(d.body.style.overflow, 'hidden', 'scroll lock kept while subscription dialog is open');
  }

  // Scenario C: a login form inside the modal is skipped entirely.
  {
    const dom = makeDom(`
      <div id="login-modal" class="modal" role="dialog" style="position:fixed">
        <p>Please disable adblock to sign in.</p><input type="password">
      </div>`);
    const w = dom.window;
    const d = w.document;
    w.eval(SOURCE);

    assertEq(d.getElementById('login-modal').style.display, '', 'login/password dialog untouched');
  }

  // Scenario D: MutationObserver catches a late popup and hides it after ~250ms.
  {
    const dom = makeDom();
    const w = dom.window;
    const d = w.document;
    w.eval(SOURCE);

    const late = d.createElement('div');
    late.className = 'modal';
    late.setAttribute('role', 'dialog');
    late.style.position = 'fixed';
    late.textContent = 'Adblock detected. Please disable your adblocker to continue.';
    d.body.appendChild(late);
    await sleep(450);
    assertEq(late.style.display, 'none', 'late-added popup hidden by observer');
  }
}

module.exports = { run, name: 'dismiss.js popup-cleanup tests (jsdom)' };
