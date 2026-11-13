/**
 * Matching.
 *
 * These are the tests that say what the engine actually does, so they are
 * written as the thing a user would type: a pattern, an input, and the text
 * that should come back. Preference order gets its own section, because
 * `a|ab` matching `a` rather than `ab` is a decision and not an accident.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Machine, search, searchAll, test as matches } from '../src/vm.js';
import { compile } from '../src/compile.js';

/** The text a pattern matches in an input, or `null`. */
function found(pattern, input, flags = '') {
  const result = search(compile(pattern, flags), input);
  return result.matched ? result.text : null;
}

/** The captures of a match, as text. */
function captures(pattern, input, flags = '') {
  return search(compile(pattern, flags), input).groups.map((group) => group.text);
}

// ---- literals ----

test('a literal matches itself', () => {
  assert.equal(found('abc', 'abc'), 'abc');
});

test('a literal is found inside a longer text', () => {
  assert.equal(found('abc', 'xxabcyy'), 'abc');
});

test('a literal that is not there does not match', () => {
  assert.equal(found('abc', 'abd'), null);
});

test('an empty pattern matches the empty string at the start', () => {
  const result = search(compile(''), 'abc');
  assert.equal(result.matched, true);
  assert.equal(result.index, 0);
  assert.equal(result.end, 0);
});

test('a pattern matches the empty input when it can', () => {
  assert.equal(found('a*', ''), '');
  assert.equal(found('a', ''), null);
});

// ---- the dot ----
