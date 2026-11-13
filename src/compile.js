/**
 * A syntax tree to a program the virtual machine can run.
 *
 * Thompson's construction, emitted straight into a flat array. The one thing
 * worth watching while reading this is how a branch is written: an
 * instruction is emitted with its targets left blank, the body is compiled,
 * and only then are the targets filled in, because until the body is
 * compiled nobody knows where it ends.
 *
 * Preference order is carried by `split`, which always tries `x` before `y`.
 * A greedy quantifier puts the body in `x`; a lazy one puts the exit there.
 * That single swap is the whole difference between `a+` and `a+?`.
 */

import { Anchor, NodeType } from './ast.js';
import { Op, Program } from './program.js';
import { PatternError, fail } from './syntax-error.js';
import { normalize, range } from './ranges.js';
import { Parser, parse } from './parser.js';

/** The largest program we will build, so a count cannot exhaust memory. */
export const MAX_PROGRAM = 20000;

/** Compiles a pattern straight from its text. */
export function compile(pattern, flags = '') {
  const parser = new Parser(String(pattern));
  const tree = parser.parse();
  return compileTree(tree, {
    flags,
    source: String(pattern),
    groups: parser.groups,
    names: parser.names,
  });
}

/** Compiles an already-parsed tree. */
export function compileTree(tree, meta = {}) {
  const flags = normalizeFlags(meta.flags ?? '', meta.source ?? '');
  const compiler = new Compiler(flags, meta.source ?? '');
  return compiler.run(tree, meta);
}

/** Checks the flags and returns them as a set of booleans. */
export function normalizeFlags(flags, source = '') {
  const known = new Set(['i', 's', 'm']);
  const seen = new Set();

  for (const flag of String(flags)) {
    if (!known.has(flag)) fail(`'${flag}' is not a flag this engine knows`, 0, source);
    if (seen.has(flag)) fail(`the flag '${flag}' is given twice`, 0, source);
    seen.add(flag);
  }

  return {
    text: [...seen].sort().join(''),
    ignoreCase: seen.has('i'),
    dotAll: seen.has('s'),
    multiline: seen.has('m'),
  };
}

/**
 * Adds the other case of every letter in a set.
 *
 * Only the two cased alphabets are folded. Doing it properly for every
 * script in Unicode is a table this project has no business carrying, and
 * saying so is better than pretending otherwise.
 */
export function foldCase(ranges) {
  const folded = [...ranges];

  for (const [lo, hi] of ranges) {
    for (let code = lo; code <= hi && code < 0x80; code += 1) {
      const character = String.fromCodePoint(code);
      const lower = character.toLowerCase();
      const upper = character.toUpperCase();
      if (lower !== character) folded.push(range(lower));
      if (upper !== character) folded.push(range(upper));
    }
  }

  return normalize(folded);
}
