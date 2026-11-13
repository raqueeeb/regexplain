/**
 * What a pattern costs, and what it would cost elsewhere.
 *
 * The useful thing a regex tool can tell you is not how clever your pattern
 * is but whether it is safe. The answer here has two halves:
 *
 * - **In this engine**, every pattern is safe. The thread list cannot hold
 *   more entries than the program has instructions, so the work is at most
 *   `instructions x characters`. That number is reported so it can be seen.
 * - **In a backtracking engine** — JavaScript's own `RegExp`, PCRE, Python's
 *   `re` — a nested quantifier over an overlapping set can take time
 *   exponential in the input length. Those are found and named here, because
 *   a pattern that is fine in this engine may be the one that takes a server
 *   down when somebody copies it into a different language.
 */

import { NodeType, groupsOf, isNullable, walk } from './ast.js';
import { Op } from './program.js';
import { size } from './ranges.js';

/** How bad a finding is. */
export const Severity = {
  WARNING: 'warning',
  NOTE: 'note',
};
