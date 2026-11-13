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
