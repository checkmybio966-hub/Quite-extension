'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Tiny assertion helpers with descriptive failures.
class Failure extends Error {}

function assert(cond, message) {
  if (!cond) throw new Failure(message || 'assertion failed');
}

function assertEq(actual, expected, message) {
  if (actual !== expected) {
    throw new Failure(`${message || 'assertEq'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertDeepEq(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Failure(`${message || 'assertDeepEq'}: expected ${b}, got ${a}`);
  }
}

function assertRejects(promiseFactory, pattern, message) {
  return promiseFactory().then(
    () => { throw new Failure(`${message || 'assertRejects'}: promise resolved but expected rejection`); },
    err => {
      const text = String(err && err.message || err);
      if (pattern && !pattern.test(text)) {
        throw new Failure(`${message || 'assertRejects'}: error ${JSON.stringify(text)} did not match ${pattern}`);
      }
    }
  );
}

module.exports = { ROOT, read, exists, sleep, assert, assertEq, assertDeepEq, assertRejects, Failure };
