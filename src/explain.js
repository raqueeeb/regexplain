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

/** One node, in a few words, with no mention of its children. */
export function summarise(node) {
  switch (node.type) {
    case NodeType.EMPTY:
      return 'nothing at all';

    case NodeType.LITERAL:
      return `the character ${quote(node.char)}`;

    case NodeType.CLASS:
      return describeClass(node);

    case NodeType.ANY:
      return 'any character except a newline';

    case NodeType.ANCHOR:
      return ANCHORS[node.kind] ?? node.kind;

    case NodeType.CONCAT:
      return `${node.parts.length} things in a row`;

    case NodeType.ALTERNATE:
      return `one of ${node.options.length} alternatives, trying them in order`;

    case NodeType.REPEAT:
      return describeRepeat(node);

    case NodeType.GROUP:
      if (node.name) return `a group captured as '${node.name}' (number ${node.index})`;
      if (node.index !== null) return `a group captured as number ${node.index}`;
      return 'a group that is not captured';

    default:
      return node.type;
  }
}

/** A character class in words. */
export function describeClass(node) {
  if (node.source && /^\\[dwsDWS]$/.test(node.source)) {
    const named = {
      d: 'a digit',
      w: 'a word character: a letter, a digit or an underscore',
      s: 'a whitespace character',
    }[node.source[1].toLowerCase()];
    return node.negated ? `any character that is not ${named}` : named;
  }

  const inside = describe(node.ranges);
  return node.negated ? `any character except ${inside}` : `one of: ${inside}`;
}

/** How many times, in words. */
export function describeRepeat(node) {
  const { min, max, lazy } = node;
  const preference = lazy ? ', preferring as few as possible' : ', preferring as many as possible';

  if (min === 0 && max === null) return `zero or more times${preference}`;
  if (min === 1 && max === null) return `one or more times${preference}`;
  if (min === 0 && max === 1) return lazy ? 'optionally, preferring to skip it' : 'optionally';
  if (max === null) return `at least ${min} times${preference}`;
  if (min === max) return `exactly ${min} times`;
  return `between ${min} and ${max} times${preference}`;
}

/** A character for prose, quoted and with the invisible ones named. */
export function quote(character) {
  const code = character.codePointAt(0);
  if (code < 32 || code === 127) return describeCode(code);
  if (character === ' ') return 'a space';
  return `'${character}'`;
}

/** The tree as indented lines, each with its summary. */
export function outline(node, depth = 0) {
  const lines = [`${'  '.repeat(depth)}${summarise(node)}`];
  for (const child of childrenOf(node)) lines.push(...outline(child, depth + 1));
  return lines;
}

/**
 * The whole pattern as one sentence.
 *
 * Recursive, and deliberately a little repetitive: prose that tries to be
 * elegant about nesting ends up ambiguous, and an explanation that is
 * ambiguous is worse than one that is wordy.
 */
export function sentence(node) {
  switch (node.type) {
    case NodeType.EMPTY:
      return 'nothing';

    case NodeType.LITERAL:
      return quote(node.char);

    case NodeType.CLASS:
      return describeClass(node);

    case NodeType.ANY:
      return 'any character except a newline';

    case NodeType.ANCHOR:
      return ANCHORS[node.kind] ?? node.kind;

    case NodeType.CONCAT:
      return joinWith(node.parts.map((part) => sentence(part)), 'then');

    case NodeType.ALTERNATE:
      return `either ${joinWith(node.options.map((option) => sentence(option)), 'or')}`;

    case NodeType.REPEAT:
      return `${sentence(node.node)}, ${describeRepeat(node)}`;

    case NodeType.GROUP: {
      const inner = sentence(node.node);
      if (node.name) return `${inner} (captured as '${node.name}')`;
      if (node.index !== null) return `${inner} (captured as group ${node.index})`;
      return inner;
    }

    default:
      return node.type;
  }
}
