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

/** The characters a node can begin with, as a set size, or `null` for any. */
export function firstSetSize(node) {
  switch (node.type) {
    case NodeType.LITERAL:
      return 1;
    case NodeType.CLASS:
      return node.negated ? null : size(node.ranges);
    case NodeType.ANY:
      return null;
    case NodeType.GROUP:
      return firstSetSize(node.node);
    case NodeType.REPEAT:
      return firstSetSize(node.node);
    case NodeType.CONCAT:
      return node.parts.length > 0 ? firstSetSize(node.parts[0]) : 0;
    case NodeType.ALTERNATE: {
      const sizes = node.options.map((option) => firstSetSize(option));
      if (sizes.some((each) => each === null)) return null;
      return sizes.reduce((total, each) => total + each, 0);
    }
    default:
      return 0;
  }
}

/**
 * Quantifiers that contain a quantifier.
 *
 * `(a+)+` is the classic: for a run of a's there are exponentially many ways
 * to divide it between the inner and outer repetition, and a backtracking
 * engine tries all of them before concluding that the pattern does not
 * match. This engine tries each *position* once instead, so it is immune —
 * but the pattern is still a trap in every other engine.
 */
export function nestedQuantifiers(tree) {
  const found = [];

  walk(tree, (node) => {
    if (node.type !== NodeType.REPEAT) return;
    if (node.max !== null && node.max <= 1) return;

    walk(node.node, (inner, depth) => {
      if (depth === 0) return;
      if (inner.type !== NodeType.REPEAT) return;
      if (inner.max !== null && inner.max <= 1) return;
      found.push({ outer: node, inner });
    });
  });

  return found;
}
