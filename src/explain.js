/**
 * A pattern in words.
 *
 * Two readings of the same tree. `summarise` gives one sentence per node for
 * a tree view, which is the one to read when you want to know what a
 * particular bracket does. `sentence` gives flowing prose for the whole
 * pattern, which is the one to read when somebody hands you a regex and you
 * have no idea what it is for.
 *
 * The wording avoids the jargon of the syntax it is explaining: a reader who
 * already knows what "a non-greedy Kleene star over a character class"
 * means does not need this.
 */

import { Anchor, NodeType, childrenOf } from './ast.js';
import { describe, describeCode } from './ranges.js';

/** What each anchor checks. */
const ANCHORS = {
  [Anchor.START]: 'the start of the text',
  [Anchor.END]: 'the end of the text',
  [Anchor.WORD_BOUNDARY]: 'a word boundary',
  [Anchor.NOT_WORD_BOUNDARY]: 'a position that is not a word boundary',
};
