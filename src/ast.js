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
