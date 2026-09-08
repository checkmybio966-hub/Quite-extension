'use strict';
const { JSDOM } = require('jsdom');
const { read, assert, assertEq, sleep } = require('./helpers');

const SOURCE = read('image-saver.js');
const HOLD_MS = 650;

function makeDom() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <img id="pic" src="https://example.com/pic.jpg">
    <div id="wrapper"><img id="nested" src="https://cdn.example.com/nested.png?size=big"></div>
    <a id="link" href="#"><img id="linked" src="https://example.com/ico"></a>
  </body></html>`, { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const sent = [];
  w.chrome = {
    runtime: {
      sendMessage: async message => { sent.push(message); return { ok: true }; },
    },
  };
  return { w, d: w.document, sent };
}

function pointer(el, w, type, button = 0) {
  const event = new (w.MouseEvent || w.Event)(type, { bubbles: true, cancelable: true, button });
  el.dispatchEvent(event);
}

async function run() {
  const { w, d, sent } = makeDom();
  w.eval(SOURCE);

  const pic = d.getElementById('pic');

  // 1. Pointer-down on image + hold past threshold triggers one message.
  pointer(pic, w, 'pointerdown');
  await sleep(HOLD_MS + 200);
  assertEq(sent.length, 1, 'long-press sends download-image');
  assertEq(sent[0].type, 'download-image', 'message type is download-image');
  assertEq(sent[0].url, 'https://example.com/pic.jpg', 'correct image url');

  // 2. Quick tap (release before threshold) sends nothing.
  pointer(pic, w, 'pointerdown');
  await sleep(150);
  pointer(pic, w, 'pointerup');
  await sleep(HOLD_MS);
  assertEq(sent.length, 1, 'quick tap does not download');

  // 3. Another image (with query string) works; currentSrc is used.
  const nested = d.getElementById('nested');
  pointer(nested, w, 'pointerdown');
  await sleep(HOLD_MS + 200);
  assertEq(sent.length, 2, 'second image long-press works');
  assertEq(sent[1].url, 'https://cdn.example.com/nested.png?size=big', 'nested currentSrc url');

  // 4. Scrolling cancels a pending hold.
  pointer(nested, w, 'pointerdown');
  w.document.dispatchEvent(new w.Event('scroll', { bubbles: true }));
  await sleep(HOLD_MS + 100);
  assertEq(sent.length, 2, 'scroll cancels pending long-press');

  // 5. Right-click (button 2) is not hijacked.
  pointer(pic, w, 'pointerdown', 2);
  await sleep(HOLD_MS + 150);
  assertEq(sent.length, 2, 'right button does not trigger long-press download');
}

module.exports = { run, name: 'image-saver.js long-press download tests (jsdom)' };
