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
