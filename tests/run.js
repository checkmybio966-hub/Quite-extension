'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const JS_FILES = ['background.js', 'page-guard.js', 'dismiss.js', 'indicator.js', 'image-saver.js', 'popup.js', 'options.js'];
const TEST_FILES = ['manifest.test.js', 'background.test.js', 'page-guard.test.js', 'dismiss.test.js', 'indicator.test.js', 'image-saver.test.js', 'ui.test.js'];

const results = [];

function record(name, ok, error, stack) {
  results.push({ name, ok, error });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`[${mark}] ${name}${error ? ` — ${error}` : ''}`);
  if (stack) console.log('    ' + String(stack).split('\n').slice(1, 4).join('\n    '));
}

async function main() {
  // 1. Syntax check every extension script and test file with `node --check`.
  const syntaxTargets = [
    ...JS_FILES.map(file => path.resolve(__dirname, '..', file)),
    ...TEST_FILES.map(file => path.join(__dirname, file)),
    path.join(__dirname, 'helpers.js'),
  ];
  for (const target of syntaxTargets) {
    const check = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' });
    record(`syntax: ${path.relative(path.resolve(__dirname, '..'), target)}`,
      check.status === 0, check.stderr || check.stdout || undefined);
  }

  // 2. Manifest + static checks and each test module.
  for (const file of TEST_FILES) {
    try {
      const mod = require(path.join(__dirname, file));
      await mod.run();
      record(file, true);
    } catch (error) {
      record(file, false, error && error.message || String(error), error && error.stack);
    }
  }

  const failed = results.filter(r => !r.ok);
  const passed = results.filter(r => r.ok);
  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  console.error('Test harness crashed:', error && error.stack || error);
  process.exitCode = 1;
});
