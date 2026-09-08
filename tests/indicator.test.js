'use strict';
const { JSDOM } = require('jsdom');
const { read, assert, assertEq } = require('./helpers');

const SOURCE = read('indicator.js');

function run() {
  const dom = new JSDOM('<!doctype html><html><head></head><body><p>page</p></body></html>',
    { url: 'https://example.com/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const d = w.document;
  w.eval(SOURCE);

  const dot = d.getElementById('quietblock-dot');
  assert(dot, 'green dot element is injected');
  assertEq(dot.getAttribute('aria-hidden'), 'true', 'dot is decorative');
  assertEq(dot.style.position, 'fixed', 'dot is fixed position');
  assertEq(dot.style.top, '12px', 'dot top offset');
  assertEq(dot.style.right, '12px', 'dot right offset');
  assertEq(dot.style.width, '10px', 'dot width');
  assertEq(dot.style.height, '10px', 'dot height');
  assertEq(dot.style.borderRadius, '50%', 'dot is circular');
  assertEq(dot.style.background, 'rgb(34, 197, 94)', 'dot is green');
  assertEq(dot.style.pointerEvents, 'none', 'dot never blocks clicks');
  assertEq(dot.style.zIndex, '2147483647', 'dot is on top');
  assert(dot.parentElement === d.documentElement, 'dot attached to documentElement');

  // Running the script a second time must not duplicate the dot.
  w.eval(SOURCE);
  assertEq(d.querySelectorAll('#quietblock-dot').length, 1, 'no duplicate dots');

  // Release the window so the blinking interval does not keep Node alive.
  w.close();
}

module.exports = { run, name: 'indicator.js green blinking dot tests (jsdom)' };
