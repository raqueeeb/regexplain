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

test('an anchor cannot be repeated, because it matches no characters', () => {
  assert.match(refusal('^*').message, /anchor matches a position/);
  assert.match(refusal('\\b+').message, /anchor matches a position/);
});

// ---- quantifiers ----

test('a star is zero or more', () => {
  const tree = parse('a*');
  assert.equal(tree.type, NodeType.REPEAT);
  assert.equal(tree.min, 0);
  assert.equal(tree.max, null);
});

test('a plus is one or more', () => {
  assert.equal(parse('a+').min, 1);
  assert.equal(parse('a+').max, null);
});

test('a question mark is optional', () => {
  assert.equal(parse('a?').min, 0);
  assert.equal(parse('a?').max, 1);
});

test('a quantifier is greedy unless a question mark follows it', () => {
  assert.equal(parse('a+').lazy, false);
  assert.equal(parse('a+?').lazy, true);
  assert.equal(parse('a*?').lazy, true);
  assert.equal(parse('a??').lazy, true);
});

test('a quantifier applies to the atom before it, not the whole pattern', () => {
  const tree = parse('ab+');
  assert.equal(tree.type, NodeType.CONCAT);
  assert.equal(tree.parts[1].type, NodeType.REPEAT);
  assert.equal(tree.parts[1].node.char, 'b');
});

test('a quantifier after a group applies to the group', () => {
  const tree = parse('(ab)+');
  assert.equal(tree.type, NodeType.REPEAT);
  assert.equal(tree.node.type, NodeType.GROUP);
});

test('a count with one number is exact', () => {
  const tree = parse('a{3}');
  assert.equal(tree.min, 3);
  assert.equal(tree.max, 3);
});

test('a count with a trailing comma is open-ended', () => {
  const tree = parse('a{2,}');
  assert.equal(tree.min, 2);
  assert.equal(tree.max, null);
});

test('a count with two numbers is a range', () => {
  const tree = parse('a{2,4}');
  assert.equal(tree.min, 2);
  assert.equal(tree.max, 4);
});

test('a brace that is not a count is a literal brace', () => {
  assert.equal(typeOf('a{'), NodeType.CONCAT);
  assert.equal(parse('a{').parts[1].char, '{');
  assert.equal(parse('{x}').type, NodeType.CONCAT);
});

test('a count that counts down is refused', () => {
  assert.match(refusal('a{3,1}').message, /counts down/);
});

test('an enormous count is refused rather than compiled', () => {
  assert.match(refusal(`a{${MAX_REPEAT + 1}}`).message, /enormous/);
});

test('a quantifier with nothing to repeat is refused', () => {
  assert.match(refusal('*a').message, /nothing for/);
  assert.match(refusal('+').message, /nothing for/);
  assert.match(refusal('?').message, /nothing for/);
});

test('a quantifier on a quantifier is allowed and stacks', () => {
  // `a*+` is odd but meaningful: it repeats the repetition.
  const tree = parse('a*+');
  assert.equal(tree.type, NodeType.REPEAT);
  assert.equal(tree.node.type, NodeType.REPEAT);
});

// ---- groups ----

test('a group captures and is numbered from one', () => {
  const tree = parse('(a)(b)');
  const groups = groupsOf(tree);
  assert.deepEqual(groups.map((group) => group.index), [1, 2]);
});

test('groups are numbered by where they open, not where they close', () => {
  const groups = groupsOf(parse('((a)(b))'));
  assert.deepEqual(groups.map((group) => group.index), [1, 2, 3]);
});

test('a non-capturing group has no index', () => {
  const tree = parse('(?:a)');
  assert.equal(tree.index, null);
  assert.equal(groupsOf(tree).length, 0);
});

test('a named group has a name and an index', () => {
  const tree = parse('(?<year>a)');
  assert.equal(tree.name, 'year');
  assert.equal(tree.index, 1);
});

test('two groups cannot share a name', () => {
  assert.match(refusal('(?<a>x)(?<a>y)').message, /two groups called/);
});

test('a group name has to look like a name', () => {
  assert.match(refusal('(?<1a>x)').message, /not a usable group name/);
  assert.match(refusal('(?<>x)').message, /needs a name/);
});

test('an unclosed group is refused, naming where it opened', () => {
  const error = refusal('a(bc');
  assert.match(error.message, /never closed/);
  assert.equal(error.offset, 1);
});

test('an unopened group is refused', () => {
  assert.match(refusal('a)').message, /unexpected/);
});

test('an unknown group prefix is refused', () => {
  assert.match(refusal('(?#comment)').message, /unknown group prefix/);
});

// ---- classes ----

test('a class holds the characters named in it', () => {
  const tree = parse('[abc]');
  assert.equal(tree.type, NodeType.CLASS);
  assert.equal(tree.negated, false);
  assert.deepEqual(tree.ranges, [[97, 99]]);
});

test('a class range is inclusive', () => {
  assert.deepEqual(parse('[a-c]').ranges, [[97, 99]]);
});

test('a leading caret negates a class', () => {
  assert.equal(parse('[^a]').negated, true);
});

test('a caret elsewhere in a class is a literal caret', () => {
  const tree = parse('[a^]');
  assert.equal(tree.negated, false);
  assert.ok(tree.ranges.some(([lo]) => lo === '^'.codePointAt(0)));
});

test('a dash at either end of a class is a literal dash', () => {
  assert.ok(parse('[-a]').ranges.some(([lo]) => lo === 45));
  assert.ok(parse('[a-]').ranges.some(([lo]) => lo === 45));
});

test('a closing bracket first in a class is a literal bracket', () => {
  assert.ok(parse('[]a]').ranges.some(([lo]) => lo === 93));
});

test('a named class inside a class joins the set', () => {
  const tree = parse('[\\d-]');
  assert.ok(tree.ranges.some(([lo, hi]) => lo === 48 && hi === 57));
  assert.ok(tree.ranges.some(([lo]) => lo === 45));
});

test('a negated named class inside a class is everything else', () => {
  const tree = parse('[\\D]');
  assert.equal(tree.negated, false);
  assert.ok(tree.ranges.length > 1);
});

test('a class range that counts down is refused', () => {
  assert.match(refusal('[z-a]').message, /counts down/);
});

test('a named class cannot be one end of a range', () => {
  assert.match(refusal('[\\d-z]').message, /cannot be the end of a range/);
});

test('an unclosed class is refused', () => {
  assert.match(refusal('[abc').message, /never closed/);
  assert.match(refusal('[]').message, /never closed/);
});

// ---- escapes ----

test('an escaped special character is that character', () => {
  assert.equal(parse('\\.').char, '.');
  assert.equal(parse('\\*').char, '*');
  assert.equal(parse('\\\\').char, '\\');
});

test('the control escapes are their characters', () => {
  assert.equal(parse('\\n').char, '\n');
  assert.equal(parse('\\t').char, '\t');
  assert.equal(parse('\\r').char, '\r');
});

test('a hex escape names a character', () => {
  assert.equal(parse('\\x41').char, 'A');
});

test('a unicode escape names a character', () => {
  assert.equal(parse('\\u0041').char, 'A');
  assert.equal(parse('\\u{1F600}').char, '\u{1F600}');
});

test('a hex escape with too few digits is refused', () => {
  assert.match(refusal('\\x4').message, /hexadecimal/);
  assert.match(refusal('\\u00').message, /hexadecimal/);
});

test('a named class escape is a class', () => {
  assert.equal(typeOf('\\d'), NodeType.CLASS);
  assert.equal(parse('\\d').source, '\\d');
  assert.equal(parse('\\D').negated, true);
});

test('a letter that is not an escape is refused rather than ignored', () => {
  assert.match(refusal('\\q').message, /not an escape/);
});

test('a pattern ending in a backslash is refused', () => {
  assert.match(refusal('a\\').message, /ends in a backslash/);
});

// ---- the deliberate refusals ----

test('a backreference is refused, with the reason', () => {
  const error = refusal('(a)\\1');
  assert.match(error.message, /backreference is not supported/);
  assert.match(error.message, /backtracking/);
});

test('lookahead and lookbehind are refused, with the reason', () => {
  assert.match(refusal('(?=a)').message, /lookaround is not supported/);
  assert.match(refusal('(?!a)').message, /lookaround is not supported/);
});

// ---- errors carry a position ----

test('an error knows where in the pattern it is', () => {
  const error = refusal('ab[c');
  assert.equal(error.offset, 2);
  assert.equal(error.pattern, 'ab[c');
});

test('an error renders a caret under the offending character', () => {
  const error = refusal('ab[c');
  assert.equal(error.caretLine(), 'ab[c\n  ^');
});

test('an error reads as a sentence with its offset', () => {
  assert.match(String(refusal('a(')), /^PatternError: .* at offset 1$/);
});

test('an error turns into plain data for JSON output', () => {
  const data = refusal('a(').toJSON();
  assert.deepEqual(Object.keys(data).sort(), ['error', 'offset', 'pattern']);
});

// ---- parses ----

test('parses answers without throwing', () => {
  assert.equal(parses('a+'), true);
  assert.equal(parses('a('), false);
});

// ---- tree measurements ----

test('a tree knows its own size and depth', () => {
  const tree = parse('(ab)+');
  assert.ok(sizeOf(tree) >= 4);
  assert.ok(depthOf(tree) >= 3);
});

test('nullability is computed on the tree', () => {
  assert.equal(isNullable(parse('a*')), true);
  assert.equal(isNullable(parse('a+')), false);
  assert.equal(isNullable(parse('a|')), true);
  assert.equal(isNullable(parse('(a*)(b*)')), true);
  assert.equal(isNullable(parse('a*b')), false);
});

test('a parser reports how many groups it saw', () => {
  const parser = new Parser('(a)(b)(?:c)');
  parser.parse();
  assert.equal(parser.groups, 2);
});

test('deeply nested groups are refused rather than overflowing the stack', () => {
  const pattern = `${'('.repeat(100)}a${')'.repeat(100)}`;
  assert.match(refusal(pattern).message, /nest deeper than/);
});
