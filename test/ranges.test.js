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

test('a range inside another disappears into it', () => {
  assert.deepEqual(normalize([range('a', 'z'), range('m', 'p')]), [[97, 122]]);
});

test('ranges with a gap stay apart', () => {
  assert.deepEqual(normalize([range('a', 'b'), range('d', 'e')]), [[97, 98], [100, 101]]);
});

test('normalising nothing gives nothing', () => {
  assert.deepEqual(normalize([]), []);
});

test('two spellings of the same set normalise the same', () => {
  const first = normalize([range('a'), range('b'), range('c')]);
  const second = normalize([range('a', 'c')]);
  assert.deepEqual(first, second);
});

test('normalising does not modify what it was given', () => {
  const input = [range('m', 'p'), range('a', 'z')];
  const copy = JSON.parse(JSON.stringify(input));
  normalize(input);
  assert.deepEqual(input, copy);
});

// ---- membership ----

test('a character in a range is in the set', () => {
  assert.ok(contains([range('a', 'z')], 'm'.codePointAt(0)));
});

test('a character outside every range is not', () => {
  assert.ok(!contains([range('a', 'z')], 'A'.codePointAt(0)));
});

test('both ends of a range are in it', () => {
  const ranges = [range('a', 'z')];
  assert.ok(contains(ranges, 'a'.codePointAt(0)));
  assert.ok(contains(ranges, 'z'.codePointAt(0)));
});

test('nothing is in the empty set', () => {
  assert.ok(!contains([], 97));
});

test('membership works across many ranges, which is the binary search', () => {
  const ranges = normalize(
    Array.from({ length: 50 }, (unused, index) => range(index * 4, index * 4 + 1)),
  );
  assert.ok(contains(ranges, 100));
  assert.ok(!contains(ranges, 102));
});

// ---- set operations ----

test('a union merges both sides', () => {
  assert.deepEqual(union([range('a', 'c')], [range('b', 'e')]), [[97, 101]]);
});

test('a complement covers everything the set does not', () => {
  const inverted = invert([range('a', 'z')]);
  assert.ok(contains(inverted, 'A'.codePointAt(0)));
  assert.ok(!contains(inverted, 'm'.codePointAt(0)));
});

test('a complement reaches the top of the code-point space', () => {
  const inverted = invert([range('a')]);
  assert.equal(inverted[inverted.length - 1][1], MAX_CODE_POINT);
});

test('a complement of a complement is the original set', () => {
  const original = normalize([range('a', 'c'), range('x', 'z')]);
  assert.deepEqual(invert(invert(original)), original);
});

test('the complement of nothing is everything', () => {
  assert.deepEqual(invert([]), [[0, MAX_CODE_POINT]]);
});

test('size counts code points, not ranges', () => {
  assert.equal(size([range('a', 'z')]), 26);
  assert.equal(size([range('a'), range('c')]), 2);
  assert.equal(size([]), 0);
});

// ---- describing ----

test('a single character describes as itself', () => {
  assert.equal(describe([range('a')]), 'a');
});

test('a range describes with a dash', () => {
  assert.equal(describe([range('a', 'z')]), 'a-z');
});

test('a range of two describes as both, because a-b reads oddly', () => {
  assert.equal(describe([range('a', 'b')]), 'a, b');
});

test('several ranges describe in order', () => {
  assert.equal(describe(normalize([range('0', '9'), range('a', 'f')])), '0-9, a-f');
});

test('the empty set describes as nothing', () => {
  assert.equal(describe([]), 'nothing');
});

test('the invisible characters are named', () => {
  assert.equal(describeCode(10), '\\n');
  assert.equal(describeCode(9), '\\t');
  assert.equal(describeCode(32), 'space');
  assert.equal(describeCode(0), '\\0');
});
