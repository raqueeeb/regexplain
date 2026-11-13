/**
 * The command line.
 *
 * `run` takes its output as arguments, so a command can be driven here
 * without starting a process. The exit code is part of the contract — a tool
 * that always exits zero cannot be used in a script — so every command is
 * checked for the code it returns as well as for what it prints.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { COMMANDS, VERSION, parseArgs, run, usage } from '../src/cli.js';

/** Runs a command and collects what it wrote. */
function invoke(...argv) {
  const out = [];
  const err = [];
  const code = run(argv, {
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    tty: false,
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

// ---- arguments ----

test('a command and its arguments are read in order', () => {
  const parsed = parseArgs(['match', 'a+', 'aaa']);
  assert.equal(parsed.command, 'match');
  assert.deepEqual(parsed.positional, ['a+', 'aaa']);
});

test('no arguments at all asks for help', () => {
  assert.equal(parseArgs([]).command, 'help');
});

test('flags are read from either spelling', () => {
  assert.equal(parseArgs(['match', 'a', 'b', '-f', 'i']).options.flags, 'i');
  assert.equal(parseArgs(['match', 'a', 'b', '--flags', 'i']).options.flags, 'i');
  assert.equal(parseArgs(['match', 'a', 'b', '--flags=is']).options.flags, 'is');
});

test('json is a switch', () => {
  assert.equal(parseArgs(['explain', 'a', '--json']).options.json, true);
  assert.equal(parseArgs(['explain', 'a', '-j']).options.json, true);
  assert.equal(parseArgs(['explain', 'a']).options.json, false);
});

test('colour can be forced either way', () => {
  assert.equal(parseArgs(['explain', 'a', '--color']).options.colour, true);
  assert.equal(parseArgs(['explain', 'a', '--no-color']).options.colour, false);
  assert.equal(parseArgs(['explain', 'a']).options.colour, null);
});

test('help and version can be asked for as options', () => {
  assert.equal(parseArgs(['--help']).command, 'help');
  assert.equal(parseArgs(['--version']).command, 'version');
});

test('a pattern that looks like an option is still a pattern', () => {
  // `-?` is a perfectly good pattern, and it follows a command, so there is
  // no ambiguity to resolve.
  assert.deepEqual(parseArgs(['explain', '-?']).positional, ['-?']);
});

// ---- help and version ----

test('help lists every command', () => {
  const result = invoke('help');
  assert.equal(result.code, 0);
  for (const name of Object.keys(COMMANDS)) {
    assert.match(result.out, new RegExp(`\\b${name}\\b`), `${name} is not in the help`);
  }
});

test('help says what the engine will not do', () => {
  assert.match(usage(), /no backreferences and no lookaround/);
});

test('version prints a version', () => {
  const result = invoke('version');
  assert.equal(result.code, 0);
  assert.match(result.out.trim(), /^\d+\.\d+\.\d+$/);
});

test('the version matches the one in the package', async () => {
  const { readFileSync } = await import('node:fs');
  const packaged = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packaged.version, VERSION);
});

// ---- bad usage ----

test('an unknown command is refused, with a hint', () => {
  const result = invoke('frobnicate', 'a');
  assert.equal(result.code, 2);
  assert.match(result.err, /is not a command/);
  assert.match(result.err, /regexplain help/);
});

test('an unknown option is refused', () => {
  const result = invoke('-z', 'explain', 'a');
  assert.equal(result.code, 2);
  assert.match(result.err, /is not an option/);
});

test('a command with no pattern is refused', () => {
  const result = invoke('explain');
  assert.equal(result.code, 2);
  assert.match(result.err, /needs a pattern/);
});

test('a command that needs a text says so', () => {
  for (const command of ['match', 'trace', 'all']) {
    const result = invoke(command, 'a');
    assert.equal(result.code, 2, command);
    assert.match(result.err, /needs a pattern and a text/);
  }
});

// ---- explain ----

test('explain describes a pattern in words', () => {
  const result = invoke('explain', 'a+');
  assert.equal(result.code, 0);
  assert.match(result.out, /This matches/);
  assert.match(result.out, /one or more times/);
});

test('explain shows the structure as a tree', () => {
  const result = invoke('explain', '(ab)+');
  assert.match(result.out, /Structure/);
  assert.match(result.out, /└─/);
});

test('explain lists the captures', () => {
  const result = invoke('explain', '(?<year>\\d{4})');
  assert.match(result.out, /Captures/);
  assert.match(result.out, /year/);
});

test('explain lists no captures when there are none', () => {
  assert.doesNotMatch(invoke('explain', 'abc').out, /Captures/);
});

test('explain says what the flags do', () => {
  const result = invoke('explain', 'a', '-f', 'i');
  assert.match(result.out, /Flags/);
  assert.match(result.out, /either case/);
});

test('explain as json carries the tree', () => {
  const result = invoke('explain', 'a+', '--json');
  const data = JSON.parse(result.out);
  assert.equal(data.pattern, 'a+');
  assert.equal(data.tree.type, 'repeat');
  assert.match(data.sentence, /one or more/);
});

// ---- match ----

test('match reports a match and exits zero', () => {
  const result = invoke('match', 'b+', 'abbc');
  assert.equal(result.code, 0);
  assert.match(result.out, /match at 1–3/);
});

test('match reports no match and exits one', () => {
  const result = invoke('match', 'z', 'abc');
  assert.equal(result.code, 1);
  assert.match(result.out, /no match/);
});

test('match shows the captures', () => {
  const result = invoke('match', '(\\w+)@(\\w+)', 'to bob@host now');
  assert.match(result.out, /"bob"/);
  assert.match(result.out, /"host"/);
});

test('match honours the flags', () => {
  assert.equal(invoke('match', 'abc', 'ABC').code, 1);
  assert.equal(invoke('match', 'abc', 'ABC', '-f', 'i').code, 0);
});

test('match as json carries the span and the groups', () => {
  const result = invoke('match', '(a)(b)', 'xaby', '--json');
  const data = JSON.parse(result.out);
  assert.equal(data.matched, true);
  assert.equal(data.index, 1);
  assert.equal(data.groups.length, 2);
});

test('match as json still exits one when nothing matched', () => {
  const result = invoke('match', 'z', 'abc', '--json');
  assert.equal(result.code, 1);
  assert.equal(JSON.parse(result.out).matched, false);
});

// ---- all ----

test('all lists every match', () => {
  const result = invoke('all', '\\d+', 'a1 b22 c333');
  assert.equal(result.code, 0);
  assert.match(result.out, /3 matches/);
  assert.match(result.out, /"333"/);
});

test('all says one match in the singular', () => {
  assert.match(invoke('all', '\\d+', 'a1').out, /1 match\b/);
});

test('all exits one when there is nothing to list', () => {
  const result = invoke('all', 'z', 'abc');
  assert.equal(result.code, 1);
  assert.match(result.out, /no match/);
});

test('all as json counts what it found', () => {
  const data = JSON.parse(invoke('all', 'a', 'aaa', '--json').out);
  assert.equal(data.count, 3);
});

// ---- trace ----

test('trace prints the thread list per position', () => {
  const result = invoke('trace', 'a+b', 'aab');
  assert.equal(result.code, 0);
  assert.match(result.out, /program counters/);
  assert.match(result.out, /thread additions/);
});

test('trace ends with the result of the match', () => {
  assert.match(invoke('trace', 'a', 'a').out, /match at 0–1/);
});

test('trace as json carries each step', () => {
  const data = JSON.parse(invoke('trace', 'a', 'a', '--json').out);
  assert.ok(Array.isArray(data.trace));
  assert.equal(data.trace[0].position, 0);
});

// ---- compile ----

test('compile disassembles the program', () => {
  const result = invoke('compile', 'a|b');
  assert.equal(result.code, 0);
  assert.match(result.out, /split/);
  assert.match(result.out, /match/);
  assert.match(result.out, /instructions/);
});

test('compile counts the capturing groups in the singular and the plural', () => {
  assert.match(invoke('compile', '(a)').out, /1 capturing group\b/);
  assert.match(invoke('compile', '(a)(b)').out, /2 capturing groups/);
});
