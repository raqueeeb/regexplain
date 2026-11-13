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
