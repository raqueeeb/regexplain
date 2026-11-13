/**
 * Pattern text to a tree.
 *
 * Half of these tests are about what the parser refuses. A regex engine that
 * accepts a pattern it cannot honour is the dangerous kind, so every refusal
 * is pinned down with the reason it gives.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Anchor, NodeType, depthOf, groupsOf, isNullable, sizeOf } from '../src/ast.js';
import { MAX_REPEAT, Parser, parse, parses } from '../src/parser.js';
import { PatternError } from '../src/syntax-error.js';

/** The type of the tree a pattern parses to. */
const typeOf = (pattern) => parse(pattern).type;

/** The error message a pattern produces. */
function refusal(pattern) {
  try {
    parse(pattern);
    return null;
  } catch (caught) {
    assert.ok(caught instanceof PatternError, `${pattern} threw a ${caught.name}`);
    return caught;
  }
}

// ---- the simple shapes ----

test('an empty pattern is the empty node', () => {
  assert.equal(typeOf(''), NodeType.EMPTY);
});

test('one character is a literal', () => {
  const tree = parse('a');
  assert.equal(tree.type, NodeType.LITERAL);
  assert.equal(tree.char, 'a');
});

test('two characters are a concatenation', () => {
  const tree = parse('ab');
  assert.equal(tree.type, NodeType.CONCAT);
  assert.equal(tree.parts.length, 2);
});

test('a concatenation of one collapses to the thing itself', () => {
  assert.equal(typeOf('a'), NodeType.LITERAL);
});

test('a dot is any character', () => {
  assert.equal(typeOf('.'), NodeType.ANY);
});
