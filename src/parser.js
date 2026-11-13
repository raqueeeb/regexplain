/**
 * Pattern text to a syntax tree.
 *
 * A plain recursive-descent parser over three levels — alternation, then
 * concatenation, then a repeated atom — which is all the grammar a regex
 * has. The interesting part is what is deliberately *not* here: there is no
 * backreference and no lookaround, because the engine behind this parser is
 * a Pike virtual machine with a linear-time guarantee and neither feature
 * can be compiled into one. Refusing them with a clear message is better
 * than accepting them and quietly matching something else.
 */

import { Anchor, alternate, anchor, any, charClass, concat, empty, group, literal, repeat } from './ast.js';
import { PatternError, fail } from './syntax-error.js';
import { MAX_CODE_POINT, invert, namedClass, normalize, range } from './ranges.js';

/** The deepest nesting a pattern may use before we refuse it. */
export const MAX_DEPTH = 64;

/** The largest repetition count `{n,m}` may name. */
export const MAX_REPEAT = 1000;

/** The characters that cannot stand alone as a literal. */
const SPECIAL = new Set(['|', '*', '+', '?', '(', ')', '[', ']', '{', '}', '^', '$', '.', '\\']);

/** The escapes that name a character rather than a class. */
const ESCAPES = {
  n: '\n',
  r: '\r',
  t: '\t',
  f: '\f',
  v: '\v',
  0: '\0',
  a: '\x07',
  e: '\x1b',
};
