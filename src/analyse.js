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

/** Repetitions whose body can match the empty string. */
export function nullableRepeats(tree) {
  const found = [];

  walk(tree, (node) => {
    if (node.type !== NodeType.REPEAT) return;
    if (node.max !== null && node.max <= 1) return;
    if (isNullable(node.node)) found.push(node);
  });

  return found;
}

/** Everything worth saying about a pattern. */
export function findings(tree) {
  const out = [];

  for (const { outer, inner } of nestedQuantifiers(tree)) {
    out.push({
      severity: Severity.WARNING,
      what: 'a quantifier inside a quantifier',
      why:
        'a backtracking engine can take time exponential in the length of '
        + 'the input on this shape. This engine cannot, but the pattern is '
        + 'still a trap anywhere else.',
      detail: `${describeQuantifier(inner)} inside ${describeQuantifier(outer)}`,
    });
  }

  for (const node of nullableRepeats(tree)) {
    out.push({
      severity: Severity.WARNING,
      what: 'a repetition of something that can match nothing',
      why:
        'each turn of the loop may consume no input, so the repetition adds '
        + 'nothing but possibilities. It is almost always a mistake in the '
        + 'pattern rather than an intention.',
      detail: describeQuantifier(node),
    });
  }

  const groups = groupsOf(tree);
  if (groups.length > 9) {
    out.push({
      severity: Severity.NOTE,
      what: `${groups.length} capturing groups`,
      why: 'a pattern with this many captures is usually easier to read split in two.',
      detail: null,
    });
  }

  const unusedCaptures = groups.filter((each) => each.name === null);
  if (unusedCaptures.length >= 3) {
    out.push({
      severity: Severity.NOTE,
      what: 'several unnamed capturing groups',
      why:
        'reading results by number breaks whenever a group is added. '
        + '`(?<name>...)` names them, and `(?:...)` groups without capturing.',
      detail: `groups ${unusedCaptures.map((each) => each.index).join(', ')}`,
    });
  }

  return out;
}

/** A quantifier as it was written, for a message. */
export function describeQuantifier(node) {
  const { min, max } = node;
  if (min === 0 && max === null) return '*';
  if (min === 1 && max === null) return '+';
  if (min === 0 && max === 1) return '?';
  if (max === null) return `{${min},}`;
  if (min === max) return `{${min}}`;
  return `{${min},${max}}`;
}

/** The whole report: size, bounds and findings. */
export function analyse(tree, program) {
  const histogram = program.histogram();
  const consuming = (histogram[Op.CHAR] ?? 0) + (histogram[Op.CLASS] ?? 0) + (histogram[Op.ANY] ?? 0);

  return {
    source: program.source,
    flags: program.flags,
    instructions: program.length,
    consuming,
    splits: histogram[Op.SPLIT] ?? 0,
    saves: histogram[Op.SAVE] ?? 0,
    asserts: histogram[Op.ASSERT] ?? 0,
    groups: program.groups,
    anchoredStart: program.anchoredStart,
    nodes: countNodes(tree),
    firstSet: firstSetSize(tree),
    nullable: isNullable(tree),
    findings: findings(tree),
  };
}

/** How many nodes the tree holds, by type. */
export function countNodes(tree) {
  const counts = {};
  let total = 0;

  walk(tree, (node) => {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
    total += 1;
  });

  return { total, byType: counts };
}

/**
 * The work this engine will do, as a bound rather than a measurement.
 *
 * `instructions x characters` is the honest worst case: each input position
 * can add each instruction to the thread list at most once.
 */
export function bound(program, inputLength) {
  return program.length * (inputLength + 1);
}
