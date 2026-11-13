/**
 * The Pike virtual machine.
 *
 * Every thread that is still alive is run in lock-step, one input character
 * at a time. A thread is a program counter and a set of capture slots, and
 * the list of threads is kept free of duplicates: a program counter already
 * reached at this position cannot be reached again, because a second visit
 * could only repeat what the first will do.
 *
 * That one rule is what bounds the work. The list can never hold more
 * threads than the program has instructions, so a search looks at each input
 * character at most once per instruction — O(n·m), with no input that makes
 * it worse. A backtracking engine has no such bound, which is why
 * `(a+)+b` against a line of a's hangs one and not this.
 *
 * The cost is that backreferences and lookaround cannot be expressed. The
 * parser refuses them rather than quietly matching something else.
 */

import { Anchor } from './ast.js';
import { Op, consumes } from './program.js';
import { contains } from './ranges.js';

/** What a word character is, for `\b`. */
const WORD = /[A-Za-z0-9_]/;

/** A list of threads that cannot hold the same program counter twice. */
class ThreadList {
  constructor(size) {
    this.threads = [];
    this.seen = new Uint8Array(size);
  }

  get length() {
    return this.threads.length;
  }

  /** The program counters in the list, in priority order. */
  counters() {
    return this.threads.map((thread) => thread.pc);
  }
}
