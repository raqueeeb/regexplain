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
