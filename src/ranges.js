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
