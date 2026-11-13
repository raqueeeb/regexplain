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

/** Parses a pattern, or throws a `PatternError`. */
export function parse(pattern) {
  return new Parser(String(pattern)).parse();
}

/** Whether a pattern parses, for callers that only want to know. */
export function parses(pattern) {
  try {
    parse(pattern);
    return true;
  } catch (caught) {
    if (caught instanceof PatternError) return false;
    throw caught;
  }
}

/** The parser itself, one per pattern. */
export class Parser {
  constructor(pattern) {
    this.pattern = pattern;
    this.at = 0;
    this.depth = 0;
    this.groups = 0;
    this.names = new Map();
  }

  /** The whole pattern, and nothing after it. */
  parse() {
    if (this.pattern === '') return empty();
    const tree = this.parseAlternation();
    if (!this.done) {
      // The only character that reaches here is an unmatched `)`.
      this.fail(`unexpected ${JSON.stringify(this.peek())}`);
    }
    return tree;
  }

  // ---- the cursor ----

  get done() {
    return this.at >= this.pattern.length;
  }

  peek(ahead = 0) {
    return this.pattern[this.at + ahead];
  }

  next() {
    const character = this.pattern[this.at];
    this.at += 1;
    return character;
  }

  eat(character) {
    if (this.peek() !== character) return false;
    this.at += 1;
    return true;
  }

  expect(character, what = `'${character}'`) {
    if (!this.eat(character)) this.fail(`expected ${what}`);
  }

  fail(message, offset = this.at) {
    fail(message, offset, this.pattern);
  }

  // ---- the grammar ----

  /** `concat ('|' concat)*` */
  parseAlternation() {
    const options = [this.parseConcat()];
    while (this.eat('|')) options.push(this.parseConcat());
    return alternate(options);
  }

  /** `repeat*`, ending at `|` or `)` or the end of the pattern. */
  parseConcat() {
    const parts = [];
    while (!this.done && this.peek() !== '|' && this.peek() !== ')') {
      parts.push(this.parseRepeat());
    }
    return concat(parts);
  }

  /** An atom with any quantifier that follows it. */
  parseRepeat() {
    const start = this.at;
    let node = this.parseAtom();

    for (;;) {
      const quantifier = this.parseQuantifier(node, start);
      if (!quantifier) return node;
      node = quantifier;
    }
  }

  /** One quantifier, or `null` when the next character is not one. */
  parseQuantifier(node, start) {
    const character = this.peek();
    let min;
    let max;

    if (character === '*') {
      [min, max] = [0, null];
      this.at += 1;
    } else if (character === '+') {
      [min, max] = [1, null];
      this.at += 1;
    } else if (character === '?') {
      [min, max] = [0, 1];
      this.at += 1;
    } else if (character === '{' && this.looksLikeCount()) {
      ({ min, max } = this.parseCount());
    } else {
      return null;
    }

    if (node.type === 'anchor') {
      this.fail('an anchor matches a position, so it cannot be repeated', start);
    }

    const lazy = this.eat('?');
    return repeat(node, min, max, lazy);
  }

  /**
   * Whether a `{` begins a count.
   *
   * A brace that is not a count is a literal brace, which is what makes
   * `a{` and `${}` parse rather than fail. Deciding needs a look ahead, so
   * it is done here rather than by backtracking.
   */
  looksLikeCount() {
    const rest = this.pattern.slice(this.at);
    return /^\{\d+(,\d*)?\}/.test(rest);
  }

  /** `{n}`, `{n,}` or `{n,m}`. */
  parseCount() {
    const start = this.at;
    this.expect('{');

    let digits = '';
    while (/\d/.test(this.peek() ?? '')) digits += this.next();
    const min = Number(digits);

    let max = min;
    if (this.eat(',')) {
      let upper = '';
      while (/\d/.test(this.peek() ?? '')) upper += this.next();
      max = upper === '' ? null : Number(upper);
    }
    this.expect('}');

    if (min > MAX_REPEAT || (max !== null && max > MAX_REPEAT)) {
      this.fail(`a count over ${MAX_REPEAT} would build an enormous program`, start);
    }
    if (max !== null && max < min) {
      this.fail(`{${min},${max}} counts down, which matches nothing`, start);
    }

    return { min, max };
  }

  /** A group, a class, an anchor, an escape or a literal. */
  parseAtom() {
    const start = this.at;
    const character = this.next();

    switch (character) {
      case undefined:
        return this.fail('the pattern ends where something was expected', start);
      case '(':
        return this.parseGroup(start);
      case '[':
        return this.parseClass(start);
      case '.':
        return any();
      case '^':
        return anchor(Anchor.START);
      case '$':
        return anchor(Anchor.END);
      case '\\':
        return this.parseEscape(start);
      case '*':
      case '+':
      case '?':
        return this.fail(`nothing for ${JSON.stringify(character)} to repeat`, start);
      case ']':
      case '}':
        // A closing bracket with no opening one is a literal, which is what
        // every engine does and what makes `a}` mean what it looks like.
        return literal(character);
      default:
        return literal(character);
    }
  }

  /** `(...)`, `(?:...)` or `(?<name>...)`. */
  parseGroup(start) {
    this.depth += 1;
    if (this.depth > MAX_DEPTH) this.fail(`groups nest deeper than ${MAX_DEPTH}`, start);

    let index = null;
    let name = null;

    if (this.eat('?')) {
      if (this.eat(':')) {
        // A non-capturing group: nothing more to read.
      } else if (this.eat('<')) {
        name = this.parseGroupName(start);
        index = this.nextGroupIndex(name, start);
      } else if (this.peek() === '=' || this.peek() === '!') {
        this.fail(
          'lookaround is not supported: it cannot be compiled to a '
            + 'linear-time program, which is what this engine guarantees',
          start,
        );
      } else {
        this.fail(`unknown group prefix '(?${this.peek() ?? ''}'`, start);
      }
    } else {
      index = this.nextGroupIndex(null, start);
    }

    const inner = this.parseAlternation();
    if (this.done) this.fail('the group is never closed', start);
    this.expect(')');
    this.depth -= 1;

    return group(inner, index, name);
  }

  /** The `name` of `(?<name>...)`. */
  parseGroupName(start) {
    let name = '';
    while (!this.done && this.peek() !== '>') name += this.next();
    if (this.done) this.fail('the group name is never closed', start);
    this.expect('>');

    if (name === '') this.fail('a named group needs a name', start);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      this.fail(`'${name}' is not a usable group name`, start);
    }
    if (this.names.has(name)) this.fail(`there are two groups called '${name}'`, start);

    return name;
  }

  /** The next capture index, recording a name if there is one. */
  nextGroupIndex(name, start) {
    this.groups += 1;
    if (name !== null) this.names.set(name, this.groups);
    if (this.groups > 99) this.fail('more than 99 capturing groups', start);
    return this.groups;
  }

  /** An escape outside a class. */
  parseEscape(start) {
    if (this.done) this.fail('the pattern ends in a backslash', start);
    const character = this.next();

    if (character === 'b') return anchor(Anchor.WORD_BOUNDARY);
    if (character === 'B') return anchor(Anchor.NOT_WORD_BOUNDARY);

    const named = namedClass(character);
    if (named) return charClass(named.ranges, named.negated, `\\${character}`);

    if (/[1-9]/.test(character)) {
      this.fail(
        'a backreference is not supported: matching one needs backtracking, '
          + 'which is what this engine exists to avoid',
        start,
      );
    }

    return literal(this.escapedCharacter(character, start));
  }

  /** The character an escape stands for. */
  escapedCharacter(character, start) {
    if (ESCAPES[character] !== undefined) return ESCAPES[character];

    if (character === 'x') return this.parseHex(2, start);
    if (character === 'u') {
      if (this.eat('{')) {
        let digits = '';
        while (!this.done && this.peek() !== '}') digits += this.next();
        this.expect('}');
        return this.codePointOf(digits, start);
      }
      return this.parseHex(4, start);
    }

    // An escaped special character is that character; an escaped letter that
    // means nothing is a mistake worth reporting rather than ignoring.
    if (SPECIAL.has(character) || !/[A-Za-z]/.test(character)) return character;
    this.fail(`'\\${character}' is not an escape this engine knows`, start);
    return character;
  }

  /** A fixed number of hexadecimal digits. */
  parseHex(count, start) {
    let digits = '';
    for (let i = 0; i < count; i += 1) {
      const character = this.peek();
      if (!/[0-9a-fA-F]/.test(character ?? '')) {
        this.fail(`expected ${count} hexadecimal digits`, start);
      }
      digits += this.next();
    }
    return this.codePointOf(digits, start);
  }

  /** The character some hexadecimal digits name. */
  codePointOf(digits, start) {
    if (digits === '' || !/^[0-9a-fA-F]+$/.test(digits)) {
      this.fail('expected hexadecimal digits', start);
    }
    const code = Number.parseInt(digits, 16);
    if (code > MAX_CODE_POINT) this.fail(`${digits} is not a code point`, start);
    return String.fromCodePoint(code);
  }

  /** `[...]`, with ranges, named classes and a leading `^`. */
  parseClass(start) {
    const negated = this.eat('^');
    const ranges = [];
    let first = true;

    while (!this.done) {
      // A `]` as the first character in a class is a literal, which is the
      // one place where position changes what a character means.
      if (this.peek() === ']' && !first) break;
      first = false;
      this.parseClassItem(ranges, start);
    }

    if (this.done) this.fail('the character class is never closed', start);
    this.expect(']');

    if (ranges.length === 0) {
      this.fail('an empty character class matches nothing', start);
    }

    const merged = normalize(ranges);
    const source = this.pattern.slice(start, this.at);
    return charClass(merged, negated, source);
  }

  /** One member of a class: a character, a named class or a range. */
  parseClassItem(ranges, start) {
    const itemStart = this.at;
    const lower = this.parseClassCharacter(start, ranges);

    if (lower === null) {
      // A named class is a set, so it cannot be one end of a range. `[\d-z]`
      // is almost always a mistake, and reading it as three members would
      // hide the mistake rather than report it.
      if (this.peek() === '-' && this.peek(1) !== ']' && this.peek(1) !== undefined) {
        this.fail('a named class cannot be the end of a range', itemStart);
      }
      return;
    }

    // A `-` directly before the closing bracket is a literal dash.
    if (this.peek() === '-' && this.peek(1) !== ']' && this.peek(1) !== undefined) {
      this.at += 1;
      const upper = this.parseClassCharacter(start, ranges);
      if (upper === null) {
        this.fail('a named class cannot be the end of a range', itemStart);
      }
      if (upper.codePointAt(0) < lower.codePointAt(0)) {
        this.fail(`[${lower}-${upper}] counts down, which matches nothing`, itemStart);
      }
      ranges.push(range(lower, upper));
      return;
    }

    ranges.push(range(lower));
  }

  /**
   * One character of a class.
   *
   * Returns `null` when the item was a named class such as `\d`, which adds
   * its own ranges, because a named class is a set and cannot be one end of
   * a range.
   */
  parseClassCharacter(start, ranges) {
    const character = this.next();

    if (character !== '\\') return character;
    if (this.done) this.fail('the class ends in a backslash', start);

    const escaped = this.next();
    const named = namedClass(escaped);
    if (named) {
      // Inside a class, a negated named class is the set of everything else,
      // so it can join the union like any other set.
      ranges.push(...(named.negated ? invert(named.ranges) : named.ranges));
      return null;
    }

    if (escaped === 'b') return '\b'; // in a class, `\b` is a backspace
    return this.escapedCharacter(escaped, start);
  }
}
