/**
 * The shapes a parsed pattern can take.
 *
 * The tree holds no behaviour at all: every node is a plain object with a
 * `type` and whatever that type needs. That is what lets the explainer, the
 * compiler and the cost analysis each walk the same tree without any of
 * them knowing about the others.
 */

/** The node types, so nothing has to spell one as a bare string. */
export const NodeType = {
  EMPTY: 'empty',
  LITERAL: 'literal',
  CLASS: 'class',
  ANY: 'any',
  ANCHOR: 'anchor',
  CONCAT: 'concat',
  ALTERNATE: 'alternate',
  REPEAT: 'repeat',
  GROUP: 'group',
};

/** The anchors the engine understands. */
export const Anchor = {
  START: 'start',
  END: 'end',
  WORD_BOUNDARY: 'wordBoundary',
  NOT_WORD_BOUNDARY: 'notWordBoundary',
};

/** Matches the empty string, which is what `a|` has on its right. */
export function empty() {
  return { type: NodeType.EMPTY };
}

/** One character, as written. */
export function literal(char) {
  return { type: NodeType.LITERAL, char };
}

/**
 * A set of characters.
 *
 * Ranges are inclusive pairs of code points, kept sorted and merged by the
 * parser so that membership is a binary search and so that two spellings of
 * the same class compare equal.
 */
export function charClass(ranges, negated = false, source = null) {
  return { type: NodeType.CLASS, ranges, negated, source };
}

/** The dot: any character, newline included only under the `s` flag. */
export function any() {
  return { type: NodeType.ANY };
}

/** A position rather than a character. */
export function anchor(kind) {
  return { type: NodeType.ANCHOR, kind };
}

/** One thing after another. */
export function concat(parts) {
  if (parts.length === 0) return empty();
  if (parts.length === 1) return parts[0];
  return { type: NodeType.CONCAT, parts };
}

/** One thing or another, preferring the earlier option. */
export function alternate(options) {
  if (options.length === 1) return options[0];
  return { type: NodeType.ALTERNATE, options };
}

/**
 * A repetition.
 *
 * `max` is `null` for an unbounded one, and `lazy` means the quantifier
 * prefers to stop rather than to continue, which is the only difference
 * between `a+` and `a+?`.
 */
export function repeat(node, min, max, lazy = false) {
  return { type: NodeType.REPEAT, node, min, max, lazy };
}

/** A group, capturing when it has an index. */
export function group(node, index = null, name = null) {
  return { type: NodeType.GROUP, node, index, name };
}

/** The children of a node, in the order they appear in the pattern. */
export function childrenOf(node) {
  switch (node.type) {
    case NodeType.CONCAT:
      return node.parts;
    case NodeType.ALTERNATE:
      return node.options;
    case NodeType.REPEAT:
    case NodeType.GROUP:
      return [node.node];
    default:
      return [];
  }
}

/** Visits every node, parents before children. */
export function walk(node, visit, depth = 0) {
  visit(node, depth);
  for (const child of childrenOf(node)) walk(child, visit, depth + 1);
}

/** How many nodes the tree holds. */
export function sizeOf(node) {
  let count = 0;
  walk(node, () => {
    count += 1;
  });
  return count;
}

/** How deeply the tree nests. */
export function depthOf(node) {
  let deepest = 0;
  walk(node, (unused, depth) => {
    deepest = Math.max(deepest, depth);
  });
  return deepest + 1;
}

/** Every capturing group in the tree, by index. */
export function groupsOf(node) {
  const groups = [];
  walk(node, (each) => {
    if (each.type === NodeType.GROUP && each.index !== null) groups.push(each);
  });
  return groups.sort((a, b) => a.index - b.index);
}

/**
 * Whether a node can match the empty string.
 *
 * This is what makes `(a*)*` worth warning about and what stops the VM from
 * looping for ever on it, so it is computed on the tree rather than guessed
 * at while matching.
 */
export function isNullable(node) {
  switch (node.type) {
    case NodeType.EMPTY:
    case NodeType.ANCHOR:
      return true;
    case NodeType.LITERAL:
    case NodeType.CLASS:
    case NodeType.ANY:
      return false;
    case NodeType.CONCAT:
      return node.parts.every((part) => isNullable(part));
    case NodeType.ALTERNATE:
      return node.options.some((option) => isNullable(option));
    case NodeType.REPEAT:
      return node.min === 0 || isNullable(node.node);
    case NodeType.GROUP:
      return isNullable(node.node);
    default:
      return false;
  }
}
