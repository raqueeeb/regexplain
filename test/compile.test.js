/**
 * The compiler.
 *
 * What matters about a compiled program is not its exact instructions but
 * its shape: that a branch exists where the pattern branches, that a jump
 * goes somewhere real, and that preference order ends up in the `split`.
 * Testing the exact listing would make every improvement a failing test.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Compiler, compile, compileTree, foldCase, normalizeFlags, startsAnchored } from '../src/compile.js';
import { Op, Program, consumes } from '../src/program.js';
import { PatternError } from '../src/syntax-error.js';
import { parse } from '../src/parser.js';
import { range } from '../src/ranges.js';

/** The opcodes a pattern compiles to, in order. */
const opsOf = (pattern, flags = '') => compile(pattern, flags).instructions.map((each) => each.op);

// ---- the wrapper ----

test('every program saves the whole match and ends in a match', () => {
  const program = compile('a');
  assert.equal(program.instructions[0].op, Op.SAVE);
  assert.equal(program.instructions[0].slot, 0);
  assert.equal(program.instructions[program.length - 2].slot, 1);
  assert.equal(program.instructions[program.length - 1].op, Op.MATCH);
});

test('an empty pattern still compiles to a runnable program', () => {
  assert.deepEqual(opsOf(''), [Op.SAVE, Op.SAVE, Op.MATCH]);
});

// ---- instructions per construct ----

test('a literal compiles to one char instruction', () => {
  assert.deepEqual(opsOf('a'), [Op.SAVE, Op.CHAR, Op.SAVE, Op.MATCH]);
});

test('a concatenation compiles in order', () => {
  const program = compile('abc');
  const chars = program.instructions.filter((each) => each.op === Op.CHAR);
  assert.deepEqual(chars.map((each) => each.char), ['a', 'b', 'c']);
});

test('a class compiles to one class instruction', () => {
  const program = compile('[a-z]');
  const instruction = program.instructions.find((each) => each.op === Op.CLASS);
  assert.deepEqual(instruction.ranges, [[97, 122]]);
  assert.equal(instruction.negated, false);
});

test('a dot compiles to any, carrying the s flag', () => {
  assert.equal(compile('.').instructions[1].dotAll, false);
  assert.equal(compile('.', 's').instructions[1].dotAll, true);
});

test('an anchor compiles to an assertion, carrying the m flag', () => {
  const instruction = compile('^', 'm').instructions[1];
  assert.equal(instruction.op, Op.ASSERT);
  assert.equal(instruction.multiline, true);
});

test('an alternation compiles to a split and a jump', () => {
  const ops = opsOf('a|b');
  assert.ok(ops.includes(Op.SPLIT));
  assert.ok(ops.includes(Op.JMP));
});

test('an alternation of three uses two splits', () => {
  const splits = compile('a|b|c').instructions.filter((each) => each.op === Op.SPLIT);
  assert.equal(splits.length, 2);
});

test('a capturing group compiles to a pair of saves', () => {
  const saves = compile('(a)').instructions.filter((each) => each.op === Op.SAVE);
  assert.deepEqual(saves.map((each) => each.slot), [0, 2, 3, 1]);
});

test('a non-capturing group compiles to no saves of its own', () => {
  const saves = compile('(?:a)').instructions.filter((each) => each.op === Op.SAVE);
  assert.equal(saves.length, 2);
});

test('a counted repetition repeats the instructions', () => {
  const chars = compile('a{3}').instructions.filter((each) => each.op === Op.CHAR);
  assert.equal(chars.length, 3);
});

test('a counted range emits the required copies then optional ones', () => {
  const program = compile('a{2,4}');
  const chars = program.instructions.filter((each) => each.op === Op.CHAR);
  const splits = program.instructions.filter((each) => each.op === Op.SPLIT);
  assert.equal(chars.length, 4);
  assert.equal(splits.length, 2);
});
