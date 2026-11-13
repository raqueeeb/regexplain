/**
 * The explanations.
 *
 * Prose is hard to assert on, so these tests check the two things that
 * actually matter: that the wording says the right thing about the hard
 * cases (greediness, negation, named classes), and that no pattern makes the
 * explainer fall over or mention a node type by its internal name.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { NodeType, walk } from '../src/ast.js';
import {
  describeClass,
  describeRepeat,
  explainFlags,
  outline,
  quote,
  sentence,
  summarise,
} from '../src/explain.js';
import { parse } from '../src/parser.js';

/** The sentence a pattern explains to. */
const said = (pattern) => sentence(parse(pattern));

// ---- single nodes ----

test('a literal is named with its character', () => {
  assert.equal(said('a'), "'a'");
});

test('a space is named rather than quoted invisibly', () => {
  assert.equal(quote(' '), 'a space');
});

test('a newline is named', () => {
  assert.equal(quote('\n'), '\\n');
});

test('the dot says what it excludes', () => {
  assert.match(said('.'), /any character except a newline/);
});

test('the anchors are explained as positions', () => {
  assert.match(said('^'), /start of the text/);
  assert.match(said('$'), /end of the text/);
  assert.match(said('\\b'), /word boundary/);
  assert.match(said('\\B'), /not a word boundary/);
});

// ---- classes ----

test('a named class is explained by name, not by its ranges', () => {
  assert.equal(describeClass(parse('\\d')), 'a digit');
  assert.match(describeClass(parse('\\w')), /letter, a digit or an underscore/);
  assert.equal(describeClass(parse('\\s')), 'a whitespace character');
});

test('a negated named class keeps its article', () => {
  assert.equal(describeClass(parse('\\D')), 'any character that is not a digit');
});

test('a written-out class lists its members', () => {
  assert.equal(describeClass(parse('[abc]')), 'one of: a-c');
});

test('a negated class says what it excludes', () => {
  assert.match(describeClass(parse('[^abc]')), /^any character except/);
});

// ---- quantifiers ----

test('a greedy quantifier says it prefers as many as possible', () => {
  assert.match(describeRepeat(parse('a*')), /zero or more times, preferring as many/);
  assert.match(describeRepeat(parse('a+')), /one or more times, preferring as many/);
});
