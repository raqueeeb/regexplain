/**
 * The error a bad pattern produces.
 *
 * A regex is written in one line, so the useful part of an error is *where*
 * it is. The offset is carried along and `caretLine` renders it under the
 * pattern, which is the whole reason this is a class and not a string.
 */

export class PatternError extends Error {
  /**
   * @param {string} message what is wrong
   * @param {number} offset where in the pattern, zero-based
   * @param {string} pattern the pattern itself
   */
  constructor(message, offset, pattern) {
    super(message);
    this.name = 'PatternError';
    this.offset = offset;
    this.pattern = pattern;
  }

  /** The pattern with a caret under the offending character. */
  caretLine() {
    const caret = `${' '.repeat(Math.max(0, this.offset))}^`;
    return `${this.pattern}\n${caret}`;
  }

  /** The message with the position in it, for one-line reporting. */
  toString() {
    return `${this.name}: ${this.message} at offset ${this.offset}`;
  }

  /** The error as plain data, for `--json`. */
  toJSON() {
    return {
      error: this.message,
      offset: this.offset,
      pattern: this.pattern,
    };
  }
}

/** Raises a `PatternError`, which reads better than `throw new` inline. */
export function fail(message, offset, pattern) {
  throw new PatternError(message, offset, pattern);
}
