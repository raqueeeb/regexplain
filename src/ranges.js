/**
 * Sets of characters, as sorted inclusive code-point ranges.
 *
 * A character class is a set, and the two things we do with a set are ask
 * whether something is in it and print it back. Keeping ranges sorted and
 * merged makes the first a binary search and the second deterministic, so
 * `[a-cb]` and `[abc]` describe themselves the same way.
 */

/** The largest code point a range may mention. */
export const MAX_CODE_POINT = 0x10ffff;

/** One range, from a character to a character. */
export function range(from, to = from) {
  const lo = typeof from === 'string' ? from.codePointAt(0) : from;
  const hi = typeof to === 'string' ? to.codePointAt(0) : to;
  return [Math.min(lo, hi), Math.max(lo, hi)];
}

/** Sorts and merges overlapping or touching ranges. */
export function normalize(ranges) {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const merged = [sorted[0].slice()];

  for (const [lo, hi] of sorted.slice(1)) {
    const last = merged[merged.length - 1];
    // Touching counts as overlapping: [a-m] and [n-z] are [a-z].
    if (lo <= last[1] + 1) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  }

  return merged;
}

/** Whether a code point is in a set, by binary search. */
export function contains(ranges, code) {
  let low = 0;
  let high = ranges.length - 1;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const [lo, hi] = ranges[middle];
    if (code < lo) high = middle - 1;
    else if (code > hi) low = middle + 1;
    else return true;
  }

  return false;
}

/** The complement of a set over the whole code-point space. */
export function invert(ranges) {
  const sorted = normalize(ranges);
  const out = [];
  let next = 0;

  for (const [lo, hi] of sorted) {
    if (lo > next) out.push([next, lo - 1]);
    next = hi + 1;
  }
  if (next <= MAX_CODE_POINT) out.push([next, MAX_CODE_POINT]);

  return out;
}

/** The union of two sets. */
export function union(left, right) {
  return normalize([...left, ...right]);
}

/** How many code points a set holds. */
export function size(ranges) {
  return ranges.reduce((total, [lo, hi]) => total + (hi - lo + 1), 0);
}

/** A character for printing, with the awkward ones escaped. */
export function describeCode(code) {
  const named = {
    9: '\\t',
    10: '\\n',
    13: '\\r',
    11: '\\v',
    12: '\\f',
    0: '\\0',
    32: 'space',
  };
  if (named[code] !== undefined) return named[code];
  if (code < 32 || code === 127) return `\\x${code.toString(16).padStart(2, '0')}`;
  return String.fromCodePoint(code);
}

/** A set as a readable summary, such as `a-z, 0-9, _`. */
export function describe(ranges) {
  if (ranges.length === 0) return 'nothing';

  return ranges
    .map(([lo, hi]) => {
      if (lo === hi) return describeCode(lo);
      // A range of two is clearer written out than as a range.
      if (hi - lo === 1) return `${describeCode(lo)}, ${describeCode(hi)}`;
      return `${describeCode(lo)}-${describeCode(hi)}`;
    })
    .join(', ');
}

/** The named classes, which both the parser and the explainer need. */
export const NAMED = {
  d: { ranges: [range('0', '9')], about: 'a digit' },
  w: {
    ranges: normalize([range('a', 'z'), range('A', 'Z'), range('0', '9'), range('_')]),
    about: 'a word character',
  },
  s: {
    ranges: normalize([
      range(9, 13),
      range(32),
      range(0xa0),
      range(0x1680),
      range(0x2000, 0x200a),
      range(0x2028, 0x2029),
      range(0x202f),
      range(0x205f),
      range(0x3000),
      range(0xfeff),
    ]),
    about: 'whitespace',
  },
};

/** The set a named class stands for, negated when the letter is upper-case. */
export function namedClass(letter) {
  const lower = letter.toLowerCase();
  const named = NAMED[lower];
  if (!named) return null;
  const negated = letter !== lower;
  return { ranges: named.ranges, negated, about: negated ? `not ${named.about}` : named.about };
}
