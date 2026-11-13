/**
 * The cost report.
 *
 * The warnings are the point of this module, so each one is tested on the
 * pattern it exists for and on a pattern it must stay quiet about. A linter
 * that cries wolf is a linter people turn off.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Severity,
  analyse,
  bound,
  countNodes,
  findings,
  firstSetSize,
  nestedQuantifiers,
  nullableRepeats,
} from '../src/analyse.js';
import { compile } from '../src/compile.js';
import { parse } from '../src/parser.js';
import { search } from '../src/vm.js';

/** The report for a pattern. */
const report = (pattern, flags = '') => analyse(parse(pattern), compile(pattern, flags));

/** The `what` of each finding for a pattern. */
const complaints = (pattern) => findings(parse(pattern)).map((finding) => finding.what);

// ---- nested quantifiers ----

test('a quantifier inside a quantifier is found', () => {
  assert.equal(nestedQuantifiers(parse('(a+)+')).length, 1);
});

test('the classic exponential pattern is warned about', () => {
  const warnings = complaints('(a+)+b');
  assert.ok(warnings.some((what) => /quantifier inside a quantifier/.test(what)));
});

test('the warning explains that this engine is not the one at risk', () => {
  const [finding] = findings(parse('(a+)+b'));
  assert.equal(finding.severity, Severity.WARNING);
  assert.match(finding.why, /This engine cannot/);
});

test('a quantifier beside a quantifier is not nested', () => {
  assert.equal(nestedQuantifiers(parse('a+b+')).length, 0);
});

test('a quantifier nested two levels down is still found', () => {
  assert.equal(nestedQuantifiers(parse('((a+)x)+')).length, 1);
});

test('an optional around a repetition is not the dangerous shape', () => {
  // `(a+)?` can only enter the body once, so there is nothing to divide.
  assert.equal(nestedQuantifiers(parse('(a+)?')).length, 0);
});

test('a counted repetition of one is not a repetition', () => {
  assert.equal(nestedQuantifiers(parse('(a+){1}')).length, 0);
});

// ---- nullable repetitions ----

test('a repetition of something that can match nothing is found', () => {
  assert.equal(nullableRepeats(parse('(a*)*')).length, 1);
});

test('a repetition of something that must consume input is fine', () => {
  assert.equal(nullableRepeats(parse('(a+)*')).length, 0);
});

test('a repetition of an alternation with an empty branch is found', () => {
  assert.equal(nullableRepeats(parse('(a|)*')).length, 1);
});

test('the warning says why it is almost always a mistake', () => {
  const [finding] = findings(parse('(a?)*'));
  assert.match(finding.why, /consume no input/);
});

// ---- notes ----

test('a great many capturing groups is a note, not a warning', () => {
  const pattern = '(a)'.repeat(10);
  const notes = findings(parse(pattern)).filter((each) => each.severity === Severity.NOTE);
  assert.ok(notes.some((each) => /capturing groups/.test(each.what)));
});

test('several unnamed groups suggests naming them', () => {
  const notes = findings(parse('(a)(b)(c)'));
  assert.ok(notes.some((each) => /unnamed capturing groups/.test(each.what)));
});

test('named groups are not complained about', () => {
  const notes = complaints('(?<a>x)(?<b>y)(?<c>z)');
  assert.deepEqual(notes, []);
});

test('non-capturing groups are not complained about', () => {
  assert.deepEqual(complaints('(?:a)(?:b)(?:c)'), []);
});

test('an ordinary pattern has nothing said about it', () => {
  assert.deepEqual(complaints('^\\d{4}-\\d{2}$'), []);
  assert.deepEqual(complaints('[a-z]+@[a-z]+'), []);
});

// ---- the first set ----

test('a literal can begin with one character', () => {
  assert.equal(firstSetSize(parse('abc')), 1);
});

test('a class can begin with as many characters as it holds', () => {
  assert.equal(firstSetSize(parse('[a-z]x')), 26);
});

test('a dot can begin with anything, which is not a number', () => {
  assert.equal(firstSetSize(parse('.')), null);
});

test('an alternation adds up what its options can begin with', () => {
  assert.equal(firstSetSize(parse('a|b|c')), 3);
});

test('a negated class can begin with almost anything', () => {
  assert.equal(firstSetSize(parse('[^a]')), null);
});

// ---- counting ----
