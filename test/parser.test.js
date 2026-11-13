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

test('an alternation of one collapses too', () => {
  assert.equal(typeOf('a'), NodeType.LITERAL);
});

test('an alternation keeps its options in order', () => {
  const tree = parse('a|b|c');
  assert.equal(tree.type, NodeType.ALTERNATE);
  assert.deepEqual(tree.options.map((option) => option.char), ['a', 'b', 'c']);
});

test('an empty option in an alternation is the empty node', () => {
  const tree = parse('a|');
  assert.equal(tree.options[1].type, NodeType.EMPTY);
});

test('alternation binds loosest, so ab|cd is two pairs', () => {
  const tree = parse('ab|cd');
  assert.equal(tree.type, NodeType.ALTERNATE);
  assert.equal(tree.options[0].type, NodeType.CONCAT);
});

// ---- anchors ----

test('a caret is the start of the text', () => {
  assert.equal(parse('^').kind, Anchor.START);
});

test('a dollar is the end of the text', () => {
  assert.equal(parse('$').kind, Anchor.END);
});

test('a word boundary and its negation are anchors', () => {
  assert.equal(parse('\\b').kind, Anchor.WORD_BOUNDARY);
  assert.equal(parse('\\B').kind, Anchor.NOT_WORD_BOUNDARY);
});
