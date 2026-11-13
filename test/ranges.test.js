/**
 * Character sets.
 *
 * A class is a set, so the tests are set tests: membership, union,
 * complement, and the normal form that makes two spellings of the same set
 * compare equal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_CODE_POINT,
  NAMED,
  contains,
  describe,
  describeCode,
  invert,
  namedClass,
  normalize,
  range,
  size,
  union,
} from '../src/ranges.js';

// ---- building ----

test('a range from one character is that character', () => {
  assert.deepEqual(range('a'), [97, 97]);
});

test('a range takes characters or code points', () => {
  assert.deepEqual(range('a', 'c'), [97, 99]);
  assert.deepEqual(range(97, 99), [97, 99]);
});

test('a range given backwards is turned round', () => {
  assert.deepEqual(range('c', 'a'), [97, 99]);
});

// ---- the normal form ----

test('normalising sorts ranges', () => {
  assert.deepEqual(normalize([range('x'), range('a')]), [[97, 97], [120, 120]]);
});

test('overlapping ranges merge', () => {
  assert.deepEqual(normalize([range('a', 'm'), range('f', 'z')]), [[97, 122]]);
});

test('touching ranges merge, because a-m and n-z is a-z', () => {
  assert.deepEqual(normalize([range('a', 'm'), range('n', 'z')]), [[97, 122]]);
});
