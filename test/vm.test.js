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

test('a dot matches any character but a newline', () => {
  assert.equal(found('a.c', 'abc'), 'abc');
  assert.equal(found('a.c', 'a c'), 'a c');
  assert.equal(found('a.c', 'a\nc'), null);
});

test('the s flag lets a dot match a newline', () => {
  assert.equal(found('a.c', 'a\nc', 's'), 'a\nc');
});

// ---- quantifiers ----

test('a star matches nothing at all', () => {
  assert.equal(found('xa*', 'x'), 'x');
});

test('a greedy quantifier takes as much as it can', () => {
  assert.equal(found('a+', 'caaab'), 'aaa');
  assert.equal(found('a*', 'aaa'), 'aaa');
});

test('a lazy quantifier takes as little as it can', () => {
  assert.equal(found('a+?', 'caaab'), 'a');
  assert.equal(found('a*?', 'aaa'), '');
});

test('greedy and lazy differ only in what they prefer, not in what they can match', () => {
  assert.equal(found('<.+>', '<a><b>'), '<a><b>');
  assert.equal(found('<.+?>', '<a><b>'), '<a>');
});

test('an optional part may be absent', () => {
  assert.equal(found('colou?r', 'color'), 'color');
  assert.equal(found('colou?r', 'colour'), 'colour');
});

test('an exact count matches exactly that many', () => {
  assert.equal(found('a{2}', 'aaaa'), 'aa');
  assert.equal(found('a{5}', 'aaaa'), null);
});

test('a counted range prefers the longest within it', () => {
  assert.equal(found('a{2,3}', 'aaaa'), 'aaa');
  assert.equal(found('a{2,3}?', 'aaaa'), 'aa');
});

test('an open-ended count has no upper limit', () => {
  assert.equal(found('a{2,}', 'aaaaa'), 'aaaaa');
  assert.equal(found('a{2,}', 'a'), null);
});

test('a quantified group repeats the whole group', () => {
  assert.equal(found('(ab)+', 'ababab'), 'ababab');
  assert.equal(found('(?:ab)+', 'ababX'), 'abab');
});

// ---- alternation ----

test('an alternation matches either side', () => {
  assert.equal(found('cat|dog', 'a dog'), 'dog');
  assert.equal(found('cat|dog', 'a cat'), 'cat');
});

test('an alternation prefers the earlier option, even when it is shorter', () => {
  // This is leftmost-first, not leftmost-longest: the order of the options
  // in the pattern decides.
  assert.equal(found('a|ab', 'ab'), 'a');
  assert.equal(found('ab|a', 'ab'), 'ab');
});

test('an alternation inside a concatenation only covers its own part', () => {
  assert.equal(found('^(a|b)c$', 'bc'), 'bc');
});

test('an empty option can match nothing', () => {
  assert.equal(found('x(a|)y', 'xy'), 'xy');
});

// ---- classes ----

test('a class matches any member', () => {
  assert.equal(found('[abc]+', 'zzcabzz'), 'cab');
});

test('a negated class matches anything else', () => {
  assert.equal(found('[^abc]+', 'abzzc'), 'zz');
});

test('a range in a class matches the whole range', () => {
  assert.equal(found('[a-f]+', 'xxabcfxx'), 'abcf');
});

test('the named classes match what they name', () => {
  assert.equal(found('\\d+', 'abc123'), '123');
  assert.equal(found('\\w+', ' hi_there! '), 'hi_there');
  assert.equal(found('\\s+', 'a  b'), '  ');
});

test('the negated named classes match the complement', () => {
  assert.equal(found('\\D+', '12ab34'), 'ab');
  assert.equal(found('\\W+', 'ab--cd'), '--');
  assert.equal(found('\\S+', '  ab  '), 'ab');
});

// ---- anchors ----

test('a caret pins a match to the start', () => {
  assert.equal(found('^abc', 'abcdef'), 'abc');
  assert.equal(found('^abc', 'xabc'), null);
});

test('a dollar pins a match to the end', () => {
  assert.equal(found('abc$', 'xxabc'), 'abc');
  assert.equal(found('abc$', 'abcx'), null);
});

test('both anchors together mean the whole text', () => {
  assert.equal(found('^abc$', 'abc'), 'abc');
  assert.equal(found('^abc$', 'abcd'), null);
});
