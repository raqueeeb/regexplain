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

test('an open-ended count becomes copies followed by a star', () => {
  const program = compile('a{2,}');
  assert.equal(program.instructions.filter((each) => each.op === Op.CHAR).length, 3);
  assert.equal(program.instructions.filter((each) => each.op === Op.JMP).length, 1);
});

// ---- preference order ----

test('a greedy star prefers the body', () => {
  const program = compile('a*');
  const split = program.instructions.find((each) => each.op === Op.SPLIT);
  assert.equal(program.at(split.x).op, Op.CHAR);
});

test('a lazy star prefers the exit', () => {
  const program = compile('a*?');
  const split = program.instructions.find((each) => each.op === Op.SPLIT);
  assert.notEqual(program.at(split.x).op, Op.CHAR);
});

test('a greedy plus loops back from the split', () => {
  const program = compile('a+');
  const split = program.instructions.find((each) => each.op === Op.SPLIT);
  assert.ok(split.x < split.y);
});

test('a lazy plus leaves first', () => {
  const program = compile('a+?');
  const split = program.instructions.find((each) => each.op === Op.SPLIT);
  assert.ok(split.x > split.y);
});

// ---- every target is real ----

test('every jump and split points inside the program', () => {
  for (const pattern of ['a|b', 'a*', '(ab|cd)+e', 'a{2,4}', '(a|b|c)*d']) {
    const program = compile(pattern);
    for (const instruction of program.instructions) {
      if (instruction.op === Op.JMP) {
        assert.ok(program.at(instruction.target), `${pattern}: jmp to nowhere`);
      }
      if (instruction.op === Op.SPLIT) {
        assert.ok(program.at(instruction.x), `${pattern}: split x to nowhere`);
        assert.ok(program.at(instruction.y), `${pattern}: split y to nowhere`);
      }
    }
  }
});

test('no target is left unpatched', () => {
  for (const pattern of ['a|b|c', '(a|b)*', 'a{1,3}', 'a??']) {
    for (const instruction of compile(pattern).instructions) {
      if (instruction.op === Op.SPLIT) {
        assert.notEqual(instruction.x, null, pattern);
        assert.notEqual(instruction.y, null, pattern);
      }
      if (instruction.op === Op.JMP) assert.notEqual(instruction.target, null, pattern);
    }
  }
});

// ---- flags ----

test('flags are checked when they are read', () => {
  assert.equal(normalizeFlags('is').text, 'is');
  assert.throws(() => normalizeFlags('x'), PatternError);
  assert.throws(() => normalizeFlags('ii'), /given twice/);
});

test('flags come back sorted, so ordering never matters', () => {
  assert.equal(normalizeFlags('si').text, normalizeFlags('is').text);
});

test('no flags is an empty set', () => {
  const flags = normalizeFlags('');
  assert.equal(flags.text, '');
  assert.equal(flags.ignoreCase, false);
});

test('case folding adds the other case of a letter', () => {
  const folded = foldCase([range('a')]);
  assert.equal(folded.length, 2);
});

test('case folding leaves a digit alone', () => {
  assert.deepEqual(foldCase([range('0', '9')]), [[48, 57]]);
});

test('the i flag turns a literal letter into a class', () => {
  assert.deepEqual(opsOf('a', 'i'), [Op.SAVE, Op.CLASS, Op.SAVE, Op.MATCH]);
});

test('the i flag leaves a literal digit as a char', () => {
  assert.deepEqual(opsOf('1', 'i'), [Op.SAVE, Op.CHAR, Op.SAVE, Op.MATCH]);
});

// ---- anchoring ----

test('a pattern starting with a caret is anchored', () => {
  assert.equal(startsAnchored(parse('^a')), true);
  assert.equal(compile('^a').anchoredStart, true);
});

test('a pattern that only sometimes starts with a caret is not anchored', () => {
  assert.equal(startsAnchored(parse('^a|b')), false);
  assert.equal(startsAnchored(parse('(^a)*')), false);
});

test('a pattern where every option starts with a caret is anchored', () => {
  assert.equal(startsAnchored(parse('^a|^b')), true);
});

test('a caret inside a group still anchors', () => {
  assert.equal(startsAnchored(parse('(^a)')), true);
});

test('the m flag unanchors a pattern, because a caret then matches per line', () => {
  assert.equal(compile('^a', 'm').anchoredStart, false);
});

// ---- the program object ----

test('a program reports its length and its capture slots', () => {
  const program = compile('(a)(b)');
  assert.equal(program.groups, 2);
  assert.equal(program.slots, 6);
});

test('a histogram counts the instructions by kind', () => {
  const histogram = compile('ab').histogram();
  assert.equal(histogram[Op.CHAR], 2);
  assert.equal(histogram[Op.MATCH], 1);
});

test('consuming instructions are the ones that read input', () => {
  assert.ok(consumes(Op.CHAR));
  assert.ok(consumes(Op.CLASS));
  assert.ok(consumes(Op.ANY));
  assert.ok(!consumes(Op.SPLIT));
  assert.ok(!consumes(Op.SAVE));
});

test('a disassembly has one line per instruction', () => {
  const program = compile('a|b');
  assert.equal(program.disassemble().split('\n').length, program.length);
});

test('a disassembly names each opcode', () => {
  const text = compile('[a-z]+').disassemble((ranges) => `${ranges.length}`);
  assert.match(text, /class/);
  assert.match(text, /split/);
  assert.match(text, /match/);
});

test('a program turns into plain data for JSON output', () => {
  const data = compile('a+', 'i').toJSON();
  assert.equal(data.source, 'a+');
  assert.equal(data.flags, 'i');
  assert.ok(Array.isArray(data.instructions));
});

test('a program can be built from a tree that was parsed elsewhere', () => {
  const program = compileTree(parse('ab'), { source: 'ab' });
  assert.ok(program instanceof Program);
  assert.equal(program.source, 'ab');
});

test('a compiler can be used directly', () => {
  const compiler = new Compiler(normalizeFlags(''), 'a');
  const program = compiler.run(parse('a'), { source: 'a' });
  assert.equal(program.length, 4);
});

// ---- limits ----

test('a pattern that would compile to an enormous program is refused', () => {
  // 1000 copies of a 30-instruction body is past the ceiling, and finding
  // that out at compile time is much better than at match time.
  assert.throws(() => compile(`(abcdefghij){1000}{1000}`), PatternError);
});

test('a large but reasonable count compiles', () => {
  assert.ok(compile('a{500}').length > 500);
});
