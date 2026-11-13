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
