#!/usr/bin/env node
/**
 * A small house-style check.
 *
 * There is no dependency here on purpose: the whole engine has none, and a
 * linter would be the first. What this checks is only what has actually gone
 * wrong in this repository — a stray debugging print, a line that has grown
 * past reading width, a file that forgot its doc comment. It is not a
 * replacement for a real linter and does not pretend to be one.
 *
 * A line ending in `// lint-allow` is left alone, which is how this file
 * manages to hold a list of the things it forbids.
 *
 * Usage: `node tools/lint.js [paths...]` (default: `src`, `test` and `tools`)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** The longest line we allow. Comments and code both count. */
const MAX_LINE = 110;

/** The deepest indentation that still reads as structure rather than a maze. */
const MAX_INDENT = 12;

/** The escape hatch, for a line that means the thing rather than does it. */
const ALLOW = '// lint-allow';

/**
 * Patterns that should never reach a commit.
 *
 * The equality pattern needs both a lookbehind and a lookahead: without
 * them, the `==` inside `!==` and `===` matches and every strict comparison
 * in the repository is reported.
 */
const FORBIDDEN = [
  { pattern: /\bconsole\.(log|debug|dir)\b/, message: 'left-over debugging output' }, // lint-allow
  { pattern: /\bdebugger\b/, message: 'debugger statement' }, // lint-allow
  { pattern: /\bvar\s/, message: 'var; use const or let' }, // lint-allow
  { pattern: /(?<![=!<>])==(?!=)|(?<!!)!=(?!=)/, message: 'loose equality; use === or !==' }, // lint-allow
  { pattern: /\bTODO\b|\bFIXME\b|\bXXX\b/, message: 'unfinished marker' }, // lint-allow
  { pattern: /[ \t]+$/, message: 'trailing whitespace' },
  { pattern: /\t/, message: 'tab; this project indents with spaces' },
];

/** Every JavaScript file under a directory, or the file itself. */
export function filesUnder(target) {
  if (fs.statSync(target).isFile()) return target.endsWith('.js') ? [target] : [];

  return fs
    .readdirSync(target, { withFileTypes: true })
    .flatMap((entry) => filesUnder(path.join(target, entry.name)));
}

/** One problem found in one place. */
function problem(file, line, message) {
  return { file: file.split(path.sep).join('/'), line, message };
}

/** Checks the things that are true of a line on its own. */
export function checkLine(file, index, line, found) {
  if (line.trimEnd().endsWith(ALLOW)) return;
  const at = index + 1;

  if (line.length > MAX_LINE) {
    found.push(problem(file, at, `line is ${line.length} characters, over ${MAX_LINE}`));
  }

  const indent = line.match(/^ */)[0].length;
  if (indent > MAX_INDENT && line.trim() !== '') {
    found.push(problem(file, at, `indented ${indent} spaces, over ${MAX_INDENT}`));
  }

  // A pattern inside a comment is usually the subject under discussion
  // rather than a mistake. Whitespace is the exception: it is a mistake
  // wherever it is.
  const isComment = /^\s*(\/\/|\*|\/\*)/.test(line);

  for (const { pattern, message } of FORBIDDEN) {
    if (!pattern.test(line)) continue;
    if (isComment && !message.includes('whitespace')) continue;
    found.push(problem(file, at, message));
  }
}

/** Checks a file's contents, which is everything but reading it. */
export function checkText(file, text) {
  const found = [];
  const lines = text.split('\n');

  if (text.includes('\r')) {
    found.push(problem(file, 1, 'carriage return; this repository stores LF'));
  }
  if (!text.endsWith('\n')) {
    found.push(problem(file, lines.length, 'no newline at end of file'));
  }
  if (text.endsWith('\n\n')) {
    found.push(problem(file, lines.length, 'blank line at end of file'));
  }
  if (!/^(#!.*\n)?\/\*\*/.test(text)) {
    found.push(problem(file, 1, 'file does not open with a doc comment'));
  }

  lines.forEach((line, index) => {
    // A split on a trailing newline ends in an empty string that is not a
    // line of the file.
    if (index === lines.length - 1 && line === '') return;
    checkLine(file, index, line, found);
  });

  return found;
}

/** Checks one file on disk. */
export function checkFile(file, found = []) {
  found.push(...checkText(file, fs.readFileSync(file, 'utf8')));
  return found;
}

/** Runs the check and reports. */
export function main(targets) {
  const files = targets.flatMap((target) => filesUnder(target)).sort();
  const found = [];
  for (const file of files) checkFile(file, found);

  for (const { file, line, message } of found) {
    process.stdout.write(`${file}:${line}: ${message}\n`);
  }
  process.stdout.write(`${files.length} files, ${found.length} problems\n`);

  return found.length === 0 ? 0 : 1;
}

// Run only when this file is what was asked for, so the tests can import it.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const targets = process.argv.slice(2);
  process.exitCode = main(targets.length > 0 ? targets : ['src', 'test', 'tools', 'bin']);
}
