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

/** Checks the flags and returns them as a set of booleans. */
export function normalizeFlags(flags, source = '') {
  const known = new Set(['i', 's', 'm']);
  const seen = new Set();

  for (const flag of String(flags)) {
    if (!known.has(flag)) fail(`'${flag}' is not a flag this engine knows`, 0, source);
    if (seen.has(flag)) fail(`the flag '${flag}' is given twice`, 0, source);
    seen.add(flag);
  }

  return {
    text: [...seen].sort().join(''),
    ignoreCase: seen.has('i'),
    dotAll: seen.has('s'),
    multiline: seen.has('m'),
  };
}

/**
 * Adds the other case of every letter in a set.
 *
 * Only the two cased alphabets are folded. Doing it properly for every
 * script in Unicode is a table this project has no business carrying, and
 * saying so is better than pretending otherwise.
 */
export function foldCase(ranges) {
  const folded = [...ranges];

  for (const [lo, hi] of ranges) {
    for (let code = lo; code <= hi && code < 0x80; code += 1) {
      const character = String.fromCodePoint(code);
      const lower = character.toLowerCase();
      const upper = character.toUpperCase();
      if (lower !== character) folded.push(range(lower));
      if (upper !== character) folded.push(range(upper));
    }
  }

  return normalize(folded);
}

/** Turns one tree into one program. */
export class Compiler {
  constructor(flags, source = '') {
    this.flags = flags;
    this.source = source;
    this.instructions = [];
  }

  /** Wraps the tree in the whole-match captures and the final `match`. */
  run(tree, meta = {}) {
    this.emit({ op: Op.SAVE, slot: 0 });
    this.node(tree);
    this.emit({ op: Op.SAVE, slot: 1 });
    this.emit({ op: Op.MATCH });

    return new Program(this.instructions, {
      groups: meta.groups ?? 0,
      names: meta.names ?? new Map(),
      flags: this.flags.text,
      source: meta.source ?? this.source,
      // Under `m` a `^` matches after any newline, so the search cannot be
      // pinned to position zero however the pattern begins.
      anchoredStart: startsAnchored(tree) && !this.flags.multiline,
    });
  }

  /** Appends an instruction and returns where it landed. */
  emit(instruction) {
    if (this.instructions.length >= MAX_PROGRAM) {
      fail(`the pattern compiles to more than ${MAX_PROGRAM} instructions`, 0, this.source);
    }
    this.instructions.push(instruction);
    return this.instructions.length - 1;
  }

  /** Where the next instruction will land. */
  get here() {
    return this.instructions.length;
  }

  /** Compiles one node. */
  node(node) {
    switch (node.type) {
      case NodeType.EMPTY:
        return;
      case NodeType.LITERAL:
        this.literal(node);
        return;
      case NodeType.CLASS:
        this.charClass(node);
        return;
      case NodeType.ANY:
        this.emit({ op: Op.ANY, dotAll: this.flags.dotAll });
        return;
      case NodeType.ANCHOR:
        this.emit({ op: Op.ASSERT, kind: node.kind, multiline: this.flags.multiline });
        return;
      case NodeType.CONCAT:
        for (const part of node.parts) this.node(part);
        return;
      case NodeType.ALTERNATE:
        this.alternate(node);
        return;
      case NodeType.REPEAT:
        this.repeat(node);
        return;
      case NodeType.GROUP:
        this.group(node);
        return;
      default:
        fail(`cannot compile a ${node.type}`, 0, this.source);
    }
  }

  /** One character, as a class when the `i` flag makes it two. */
  literal(node) {
    if (!this.flags.ignoreCase) {
      this.emit({ op: Op.CHAR, char: node.char });
      return;
    }

    const folded = foldCase([range(node.char)]);
    if (folded.length === 1 && folded[0][0] === folded[0][1]) {
      this.emit({ op: Op.CHAR, char: node.char });
      return;
    }
    this.emit({ op: Op.CLASS, ranges: folded, negated: false, source: node.char });
  }

  /** A set of characters. */
  charClass(node) {
    const ranges = this.flags.ignoreCase ? foldCase(node.ranges) : node.ranges;
    this.emit({
      op: Op.CLASS,
      ranges,
      negated: node.negated,
      source: node.source,
    });
  }

  /**
   * `a|b|c` as a chain of splits.
   *
   * Each option gets a jump to the end, patched once the end is known. The
   * last option needs no split, which is why the loop stops one short.
   */
  alternate(node) {
    const jumps = [];

    node.options.forEach((option, index) => {
      const last = index === node.options.length - 1;

      if (last) {
        this.node(option);
        return;
      }

      const split = this.emit({ op: Op.SPLIT, x: null, y: null });
      this.instructions[split].x = this.here;
      this.node(option);
      jumps.push(this.emit({ op: Op.JMP, target: null }));
      this.instructions[split].y = this.here;
    });

    for (const jump of jumps) this.instructions[jump].target = this.here;
  }

  /** A capturing group saves where it starts and where it ends. */
  group(node) {
    if (node.index === null) {
      this.node(node.node);
      return;
    }
    this.emit({ op: Op.SAVE, slot: node.index * 2 });
    this.node(node.node);
    this.emit({ op: Op.SAVE, slot: node.index * 2 + 1 });
  }

  /** Dispatches on the shape of the repetition. */
  repeat(node) {
    const { min, max } = node;

    if (min === 0 && max === null) {
      this.star(node);
      return;
    }
    if (min === 1 && max === null) {
      this.plus(node);
      return;
    }
    if (min === 0 && max === 1) {
      this.optional(node);
      return;
    }
    this.counted(node);
  }

  /** `a*`: a split at the top, a jump back at the bottom. */
  star(node) {
    const split = this.emit({ op: Op.SPLIT, x: null, y: null });
    const body = this.here;
    this.node(node.node);
    this.emit({ op: Op.JMP, target: split });
    const exit = this.here;

    this.prefer(split, body, exit, node.lazy);
  }

  /** `a+`: the body once, then a split that may go round again. */
  plus(node) {
    const body = this.here;
    this.node(node.node);
    const split = this.emit({ op: Op.SPLIT, x: null, y: null });
    const exit = this.here;

    this.prefer(split, body, exit, node.lazy);
  }

  /** `a?`: a split past the body. */
  optional(node) {
    const split = this.emit({ op: Op.SPLIT, x: null, y: null });
    const body = this.here;
    this.node(node.node);
    const exit = this.here;

    this.prefer(split, body, exit, node.lazy);
  }

  /**
   * `a{2,4}` by repetition.
   *
   * The required copies are emitted in full, then the optional ones as
   * nested optionals, so that `a{2,4}` prefers four copies over two without
   * ever matching three in the middle of a longer run.
   */
  counted(node) {
    const { min, max } = node;

    for (let i = 0; i < min; i += 1) this.node(node.node);

    if (max === null) {
      this.star({ ...node, min: 0, max: null });
      return;
    }

    const splits = [];
    for (let i = 0; i < max - min; i += 1) {
      const split = this.emit({ op: Op.SPLIT, x: null, y: null });
      splits.push(split);
      this.instructions[split].x = this.here;
      this.node(node.node);
    }

    const exit = this.here;
    for (const split of splits) {
      if (node.lazy) {
        this.instructions[split].y = this.instructions[split].x;
        this.instructions[split].x = exit;
      } else {
        this.instructions[split].y = exit;
      }
    }
  }

  /** Points a split at the body or the exit first, by greediness. */
  prefer(split, body, exit, lazy) {
    this.instructions[split].x = lazy ? exit : body;
    this.instructions[split].y = lazy ? body : exit;
  }
}

/**
 * Whether every way through the pattern starts with `^`.
 *
 * When it does, the search only needs to start at position zero, which turns
 * an O(n·m) scan into an O(m) one. When it does not, the VM has to try every
 * starting position.
 */
export function startsAnchored(node) {
  switch (node.type) {
    case NodeType.ANCHOR:
      return node.kind === Anchor.START;
    case NodeType.CONCAT:
      return node.parts.length > 0 && startsAnchored(node.parts[0]);
    case NodeType.ALTERNATE:
      return node.options.every((option) => startsAnchored(option));
    case NodeType.GROUP:
      return startsAnchored(node.node);
    case NodeType.REPEAT:
      // `(^a)*` can match without the anchor ever being reached.
      return node.min > 0 && startsAnchored(node.node);
    default:
      return false;
  }
}
