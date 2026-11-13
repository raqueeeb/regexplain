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
