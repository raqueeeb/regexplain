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

test('a lazy quantifier says it prefers as few as possible', () => {
  assert.match(describeRepeat(parse('a*?')), /preferring as few/);
});

test('an optional part is explained as optional', () => {
  assert.equal(describeRepeat(parse('a?')), 'optionally');
  assert.match(describeRepeat(parse('a??')), /preferring to skip it/);
});

test('an exact count says exactly', () => {
  assert.equal(describeRepeat(parse('a{3}')), 'exactly 3 times');
});

test('a counted range says both ends', () => {
  assert.match(describeRepeat(parse('a{2,4}')), /between 2 and 4 times/);
});

test('an open-ended count says at least', () => {
  assert.match(describeRepeat(parse('a{2,}')), /at least 2 times/);
});

// ---- groups ----

test('a capturing group says its number', () => {
  assert.match(said('(a)'), /captured as group 1/);
});

test('a named group says its name', () => {
  assert.match(said('(?<year>a)'), /captured as 'year'/);
});

test('a non-capturing group is not mentioned as a capture', () => {
  assert.doesNotMatch(said('(?:a)'), /captured/);
});

// ---- joining ----

test('two things in a row are joined with then', () => {
  assert.equal(said('ab'), "'a' then 'b'");
});

test('three things in a row use commas and a then', () => {
  assert.equal(said('abc'), "'a', 'b', then 'c'");
});

test('an alternation reads as either or', () => {
  assert.equal(said('a|b'), "either 'a' or 'b'");
});

test('an alternation of three uses commas and an or', () => {
  assert.match(said('a|b|c'), /either 'a', 'b', or 'c'/);
});

test('an alternation says that the order matters', () => {
  assert.match(summarise(parse('a|b')), /trying them in order/);
});

// ---- the outline ----

test('an outline has one line per node', () => {
  const tree = parse('(ab)+');
  let nodes = 0;
  walk(tree, () => {
    nodes += 1;
  });
  assert.equal(outline(tree).length, nodes);
});

test('an outline indents children under their parent', () => {
  const lines = outline(parse('(a)'));
  assert.equal(lines[0].startsWith(' '), false);
  assert.equal(lines[1].startsWith('  '), true);
});

// ---- nothing is left unexplained ----

test('every node type has wording of its own', () => {
  const patterns = ['', 'a', '\\d', '.', '^', 'ab', 'a|b', 'a*', '(a)'];
  const seen = new Set();

  for (const pattern of patterns) {
    walk(parse(pattern), (node) => {
      seen.add(node.type);
      const text = summarise(node);
      assert.notEqual(text, node.type, `${node.type} is explained by its own name`);
    });
  }

  for (const type of Object.values(NodeType)) {
    assert.ok(seen.has(type), `${type} is never exercised`);
  }
});

test('a realistic pattern explains without throwing', () => {
  const patterns = [
    '^(?<user>[\\w.+-]+)@(?<host>[\\w-]+\\.[a-z]{2,})$',
    '^#(?:[0-9a-f]{3}|[0-9a-f]{6})$',
    '\\b\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\b',
    '(?:\\r?\\n)+',
    '[^\\s"]+|"[^"]*"',
  ];

  for (const pattern of patterns) {
    const text = said(pattern);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 10, pattern);
  }
});

// ---- flags ----

test('each flag is explained', () => {
  const explained = explainFlags('ism');
  assert.equal(explained.length, 3);
  assert.match(explained[0].means, /either case/);
  assert.match(explained[1].means, /newline/);
  assert.match(explained[2].means, /every line/);
});

test('no flags explains to nothing', () => {
  assert.deepEqual(explainFlags(''), []);
});
