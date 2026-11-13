/**
 * The output.
 *
 * Terminal output is easy to break and hard to notice breaking, so the
 * things that have actually gone wrong are the things tested here: colour
 * leaking into a pipe, a table with a ragged last column, and a tree whose
 * branches do not line up.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  caret,
  heading,
  palette,
  renderAnalysis,
  renderMatch,
  renderProgram,
  renderSentence,
  renderTrace,
  renderTree,
  table,
  treeLines,
  wrap,
} from '../src/render.js';
import { analyse } from '../src/analyse.js';
import { compile } from '../src/compile.js';
import { parse } from '../src/parser.js';
import { search } from '../src/vm.js';

/** Whether text holds an escape sequence. */
const coloured = (text) => text.includes('\u001b[');

// ---- colour ----

test('colour is off when it is not asked for', () => {
  const paint = palette(false);
  assert.equal(paint.red('x'), 'x');
  assert.equal(paint.bold('x'), 'x');
});

test('colour is escape codes when it is asked for', () => {
  const paint = palette(true);
  assert.ok(coloured(paint.red('x')));
  assert.ok(paint.red('x').endsWith('\u001b[0m'));
});

test('plain text is never coloured', () => {
  assert.equal(palette(true).plain('x'), 'x');
});

test('nothing leaks colour into output that did not ask for it', () => {
  const program = compile('(a+)+b');
  const pieces = [
    renderTree(parse('a|b')),
    renderProgram(program, false),
    renderMatch(search(program, 'aab'), 'aab', false),
    renderTrace(search(program, 'aab', { trace: true }), 'aab', false),
    renderAnalysis(analyse(parse('(a+)+b'), program), false),
    heading('x', false),
    caret('ab', 1, false),
  ];

  for (const piece of pieces) assert.ok(!coloured(piece), piece.slice(0, 40));
});

// ---- wrapping ----

test('short text is one line', () => {
  assert.deepEqual(wrap('a b c', 10), ['a b c']);
});

test('long text breaks on spaces', () => {
  const lines = wrap('one two three four five', 9);
  assert.ok(lines.every((line) => line.length <= 9));
  assert.equal(lines.join(' '), 'one two three four five');
});

test('a word longer than the width is not broken', () => {
  assert.deepEqual(wrap('antidisestablishmentarianism', 5), ['antidisestablishmentarianism']);
});

test('wrapping nothing gives nothing', () => {
  assert.deepEqual(wrap('', 10), []);
});

test('runs of whitespace collapse', () => {
  assert.deepEqual(wrap('a    b', 10), ['a b']);
});

// ---- tables ----

test('a table lines its columns up', () => {
  const text = table([['a', 'x'], ['bbb', 'y']]);
  const [first, second] = text.split('\n');
  assert.equal(first.indexOf('x'), second.indexOf('y'));
});

test('a table never leaves trailing spaces on a line', () => {
  const text = table([['a', 'x'], ['bbb', 'y']]);
  for (const line of text.split('\n')) assert.equal(line, line.trimEnd());
});

test('a table can align a column to the right', () => {
  const text = table([['1', 'a'], ['100', 'b']], { align: ['right'] });
  assert.ok(text.split('\n')[0].startsWith('  1'));
});

test('an empty table is empty', () => {
  assert.equal(table([]), '');
});

test('a table with one column still works', () => {
  assert.equal(table([['a'], ['b']]), 'a\nb');
});

// ---- the tree ----

test('a tree has one line per node', () => {
  assert.equal(treeLines(parse('(ab)+')).length, 5);
});

test('the last child of a node gets a corner and the others a tee', () => {
  const lines = treeLines(parse('abc'));
  assert.ok(lines[1].includes('├─'));
  assert.ok(lines[3].includes('└─'));
});

test('a branch that continues carries a bar through its children', () => {
  const lines = treeLines(parse('(a)b'));
  assert.ok(lines.some((line) => line.startsWith('│')));
});

test('the last branch carries no bar through its children', () => {
  const lines = treeLines(parse('a(b)'));
  assert.ok(lines[lines.length - 1].startsWith('   '));
});

test('the root has no connector of its own', () => {
  assert.ok(!treeLines(parse('ab'))[0].includes('─'));
});

// ---- headings and carets ----

test('a heading is underlined to its own width', () => {
  const [title, rule] = heading('abcd', false).split('\n');
  assert.equal(rule.length, title.length);
});

test('a caret sits under the offset it names', () => {
  const [line, pointer] = caret('abcd', 2, false).split('\n');
  assert.equal(pointer.indexOf('^'), line.indexOf('c'));
});

test('a caret at offset zero is still inside the output', () => {
  assert.ok(caret('abcd', 0, false).includes('^'));
});

// ---- matches ----

test('a match shows where it matched', () => {
  const text = renderMatch(search(compile('b+'), 'abbc'), 'abbc', false);
  assert.match(text, /match at 1–3/);
});

test('a failed match says so', () => {
  assert.match(renderMatch(search(compile('z'), 'abc'), 'abc', false), /no match/);
});

test('an empty match is shown as a mark rather than as nothing', () => {
  const text = renderMatch(search(compile('a*'), 'bbb'), 'bbb', false);
  assert.ok(text.includes('∅'));
});
))
