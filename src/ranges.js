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
