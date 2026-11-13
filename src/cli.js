/**
 * The command line.
 *
 * Every command takes a pattern and prints something about it. The shape is
 * always the same — parse the arguments, do the work, render it — and the
 * rendering lives in `render.js`, so this file reads as a list of what the
 * tool can be asked.
 *
 * `run` returns an exit code and writes through an injected `out` and `err`,
 * which is what lets the tests drive the whole command line without starting
 * a process or capturing a stream.
 */

import { analyse } from './analyse.js';
import { compile, normalizeFlags } from './compile.js';
import { explainFlags, sentence } from './explain.js';
import { PatternError } from './syntax-error.js';
import { groupsOf } from './ast.js';
import { parse } from './parser.js';
import { search, searchAll } from './vm.js';
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
} from './render.js';

/** The version, kept in step with package.json by a test. */
export const VERSION = '1.0.0';

/** What the tool can be asked to do. */
export const COMMANDS = {
  explain: 'describe a pattern in words and as a tree',
  match: 'match a pattern against a text and show the captures',
  all: 'show every non-overlapping match in a text',
  trace: 'show the thread list at each input position',
  compile: 'disassemble a pattern into the program the machine runs',
  cost: 'report the size of a pattern and anything worth warning about',
  help: 'print this help',
  version: 'print the version',
};

/** The usage text. */
export function usage() {
  const rows = Object.entries(COMMANDS).map(([name, about]) => [`  ${name}`, about]);

  return [
    'regexplain - a regular expression engine that explains itself',
    '',
    'Usage:',
    '  regexplain <command> <pattern> [text] [options]',
    '',
    'Commands:',
    table(rows),
    '',
    'Options:',
    table([
      ['  -f, --flags <set>', 'any of i (ignore case), s (dot matches newline), m (multiline)'],
      ['  -j, --json', 'print the result as JSON'],
      ['      --no-color', 'never colour the output'],
      ['      --color', 'colour the output even when it is not a terminal'],
      ['  -h, --help', 'print this help'],
    ]),
    '',
    'Examples:',
    '  regexplain explain "^(\\d{4})-(\\d{2})$"',
    '  regexplain match "(\\w+)@(\\w+)" "mail bob@example"',
    '  regexplain trace "a+b" "aab"',
    '  regexplain cost "(a+)+b"',
    '',
    'This engine has no backreferences and no lookaround, on purpose: both',
    'need backtracking, and backtracking is what makes a regex able to hang.',
  ].join('\n');
}

/** Splits argv into a command, positional arguments and options. */
export function parseArgs(argv) {
  const options = { flags: '', json: false, colour: null };
  const positional = [];
  const rest = [...argv];

  while (rest.length > 0) {
    const argument = rest.shift();

    switch (argument) {
      case '-f':
      case '--flags':
        options.flags = rest.shift() ?? '';
        break;
      case '-j':
      case '--json':
        options.json = true;
        break;
      case '--color':
        options.colour = true;
        break;
      case '--no-color':
        options.colour = false;
        break;
      case '-h':
      case '--help':
        positional.unshift('help');
        break;
      case '-V':
      case '--version':
        positional.unshift('version');
        break;
      default:
        if (argument.startsWith('--flags=')) options.flags = argument.slice('--flags='.length);
        else if (argument.startsWith('-') && argument.length > 1 && !positional.length) {
          options.unknown = argument;
        } else positional.push(argument);
    }
  }

  return { command: positional[0] ?? 'help', positional: positional.slice(1), options };
}
