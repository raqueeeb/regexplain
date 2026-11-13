/**
 * The instruction set the virtual machine runs.
 *
 * A compiled pattern is a flat list of instructions, not a graph. That is
 * the whole trick behind a Pike VM: `split` names two program counters
 * instead of a node having two edges, so the program is an array, a thread
 * is an index into it, and the simulation is a loop rather than a recursion.
 *
 * Instructions are plain objects. `disassemble` prints them, which turns a
 * regex into something you can read a line at a time.
 */

/** Every opcode. */
export const Op = {
  /** Consume one specific character. */
  CHAR: 'char',
  /** Consume one character from a set. */
  CLASS: 'class',
  /** Consume any one character. */
  ANY: 'any',
  /** Try `x` first, then `y`, at the same input position. */
  SPLIT: 'split',
  /** Continue at `target`. */
  JMP: 'jmp',
  /** Record the current position in a capture slot. */
  SAVE: 'save',
  /** Check a position without consuming anything. */
  ASSERT: 'assert',
  /** The pattern has matched. */
  MATCH: 'match',
};

/** Whether an opcode consumes a character. */
export function consumes(op) {
  return op === Op.CHAR || op === Op.CLASS || op === Op.ANY;
}
