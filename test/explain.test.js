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
