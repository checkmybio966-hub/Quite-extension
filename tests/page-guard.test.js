'use strict';
const { JSDOM } = require('jsdom');
const { read, assert, assertEq } = require('./helpers');

const SOURCE = read('page-guard.js');

function makeDom() {
  const dom = new JSDOM(`<!doctype html>
<html><head></head><body>
  <div id="bait" class="adsbox" style="display:none"></div>
  <div id="bait2" class="content ad-banner" style="display:none;width:10px;height:10px"></div>
  <div id="normal" class="article content" style="display:none;width:300px;height:250px"></div>
  <div id="nonprobe-text" class="adsbox" style="display:none"></div>
</body></html>`, { url: 'https://example.com/', runScripts: 'outside-only' });
  return dom;
}

function run() {
  const dom = makeDom();
  const w = dom.window;
  const d = w.document;

  // Make the "nonprobe-text" bait ineligible by adding text content.
  const nonProbe = d.getElementById('nonprobe-text');
  nonProbe.textContent = 'This slot contains real content and must never be touched';

  // page-guard patches are installed at document_start, before content exists.
  // Simulate that by patching first, then attaching a fresh bait element.
  w.eval(SOURCE);

  const bait = d.createElement('div');
  bait.id = 'adsbox';
  bait.className = 'adsbox';
  bait.style.display = 'none';
  d.body.appendChild(bait);

  const bait2 = d.getElementById('bait2');
  const normal = d.getElementById('normal');

  // 1. Patched getters return plausible geometry for bait, native values for normal content.
  assertEq(bait.offsetWidth, 1, 'bait offsetWidth masked to hint');
  assertEq(bait2.offsetWidth, 10, 'styled bait keeps its own small size');
  assertEq(normal.offsetWidth, 0, 'normal element keeps native zero offsetWidth');
  assertEq(nonProbe.offsetWidth, 0, 'content-filled bait is left alone');

  // 2. getComputedStyle proxy masks display/visibility for bait only.
  const baitStyle = w.getComputedStyle(bait);
  assertEq(baitStyle.display, 'block', 'bait display masked to block');
  assertEq(baitStyle.getPropertyValue('display'), 'block', 'getPropertyValue(display) masked');

  const normalStyle = w.getComputedStyle(normal);
  assertEq(normalStyle.display, 'none', 'normal element display untouched');

  const nonProbeStyle = w.getComputedStyle(nonProbe);
  assertEq(nonProbeStyle.display, 'none', 'content-filled bait display untouched');

  // 3. getBoundingClientRect (patched when the browser exposes DOMRect).
  const rect = bait.getBoundingClientRect();
  assert(rect.width > 0 && rect.height > 0, 'bait rect has positive size');
  const normalRect = normal.getBoundingClientRect();
  assertEq(normalRect.width, 0, 'normal element rect stays zero');
  const nonProbeRect = nonProbe.getBoundingClientRect();
  assertEq(nonProbeRect.width, 0, 'content-filled bait rect stays zero');

  // 4. offsetParent is masked only for bait.
  assertEq(bait.offsetParent, d.body, 'bait offsetParent masked to body');
  assert(normal.offsetParent !== d.body, 'normal offsetParent untouched');

  // 5. The proxy only wraps top-level style reads; direct CSSStyleDeclaration
  // property reads (e.g. node.style.display) keep native values.
  assertEq(bait.style.display, 'none', 'inline style property untouched by the proxy');
  assertEq(normal.style.display, 'none', 'normal inline style untouched');
}

module.exports = { run, name: 'page-guard.js DOM hook tests (jsdom)' };
