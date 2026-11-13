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

/** One run of one program over one input. */
export class Machine {
  /**
   * @param {import('./program.js').Program} program
   * @param {object} [options]
   * @param {boolean} [options.trace] keep a snapshot per input position
   */
  constructor(program, options = {}) {
    this.program = program;
    this.wantTrace = Boolean(options.trace);
    this.steps = 0;
    this.trace = [];
    this.peakThreads = 0;
  }

  /** Adds a thread, following everything that does not consume input. */
  addThread(list, pc, position, slots) {
    if (list.seen[pc]) return;
    list.seen[pc] = 1;
    this.steps += 1;

    const instruction = this.program.at(pc);

    switch (instruction.op) {
      case Op.JMP:
        this.addThread(list, instruction.target, position, slots);
        return;

      case Op.SPLIT:
        // `x` first: preference order is carried by the order of these two
        // calls and by nothing else.
        this.addThread(list, instruction.x, position, slots);
        this.addThread(list, instruction.y, position, slots);
        return;

      case Op.SAVE: {
        const copy = slots.slice();
        copy[instruction.slot] = position;
        this.addThread(list, pc + 1, position, copy);
        return;
      }

      case Op.ASSERT:
        if (this.holds(instruction, position)) {
          this.addThread(list, pc + 1, position, slots);
        }
        return;

      default:
        list.threads.push({ pc, slots });
    }
  }

  /** Whether a zero-width assertion holds at a position. */
  holds(instruction, position) {
    const { characters } = this;
    const before = position > 0 ? characters[position - 1] : null;
    const after = position < characters.length ? characters[position] : null;

    switch (instruction.kind) {
      case Anchor.START:
        if (position === 0) return true;
        return Boolean(instruction.multiline) && before === '\n';

      case Anchor.END:
        if (position === characters.length) return true;
        return Boolean(instruction.multiline) && after === '\n';

      case Anchor.WORD_BOUNDARY:
        return isWord(before) !== isWord(after);

      case Anchor.NOT_WORD_BOUNDARY:
        return isWord(before) === isWord(after);

      default:
        return false;
    }
  }

  /** Whether an instruction that consumes input accepts a character. */
  accepts(instruction, character) {
    if (character === undefined) return false;

    switch (instruction.op) {
      case Op.CHAR:
        return character === instruction.char;

      case Op.CLASS: {
        const inside = contains(instruction.ranges, character.codePointAt(0));
        return instruction.negated ? !inside : inside;
      }

      case Op.ANY:
        return instruction.dotAll || character !== '\n';

      default:
        return false;
    }
  }

  /**
   * Runs the program over an input.
   *
   * The input is split into code points first, so an astral character counts
   * as one character and positions are code-point offsets. That differs from
   * a JavaScript string index, which is the honest answer rather than the
   * convenient one.
   */
  run(input, start = 0) {
    this.characters = Array.from(String(input));
    const { characters, program } = this;
    const empty = new Array(program.slots).fill(null);

    let current = new ThreadList(program.length);
    let matched = null;

    for (let position = start; position <= characters.length; position += 1) {
      // A fresh attempt at this position, at the lowest priority, which is
      // what makes an unanchored pattern find the leftmost match.
      if (matched === null && (!program.anchoredStart || position === start)) {
        this.addThread(current, 0, position, empty);
      }

      this.peakThreads = Math.max(this.peakThreads, current.length);
      if (this.wantTrace) {
        this.trace.push({
          position,
          character: characters[position] ?? null,
          counters: current.counters(),
          threads: current.length,
        });
      }

      if (current.length === 0 && matched !== null) break;

      const next = new ThreadList(program.length);

      for (const thread of current.threads) {
        const instruction = program.at(thread.pc);

        if (instruction.op === Op.MATCH) {
          matched = thread.slots;
          // Every thread after this one is lower priority, so whatever it
          // would find is a match this engine has chosen not to prefer.
          break;
        }

        if (consumes(instruction.op) && this.accepts(instruction, characters[position])) {
          this.addThread(next, thread.pc + 1, position + 1, thread.slots);
        }
      }

      current = next;
    }

    return this.result(matched);
  }

  /** The slots as a result object. */
  result(slots) {
    if (slots === null) {
      return {
        matched: false,
        index: null,
        end: null,
        text: null,
        groups: [],
        steps: this.steps,
        peakThreads: this.peakThreads,
        trace: this.trace,
      };
    }

    const { characters, program } = this;
    const slice = (from, to) => (from === null || to === null ? null : characters.slice(from, to).join(''));

    const groups = [];
    for (let index = 1; index <= program.groups; index += 1) {
      const from = slots[index * 2];
      const to = slots[index * 2 + 1];
      groups.push({
        index,
        name: nameOf(program.names, index),
        start: from,
        end: to,
        text: slice(from, to),
      });
    }

    return {
      matched: true,
      index: slots[0],
      end: slots[1],
      text: slice(slots[0], slots[1]),
      groups,
      steps: this.steps,
      peakThreads: this.peakThreads,
      trace: this.trace,
    };
  }
}

/** Whether a character counts as a word character. */
export function isWord(character) {
  return character !== null && character !== undefined && WORD.test(character);
}
