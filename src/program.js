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

/** A compiled pattern. */
export class Program {
  /**
   * @param {object[]} instructions
   * @param {object} meta
   */
  constructor(instructions, meta = {}) {
    this.instructions = instructions;
    this.groups = meta.groups ?? 0;
    this.names = meta.names ?? new Map();
    this.flags = meta.flags ?? '';
    this.source = meta.source ?? '';
    this.anchoredStart = meta.anchoredStart ?? false;
  }

  /** How many instructions there are. */
  get length() {
    return this.instructions.length;
  }

  /** How many capture slots a thread needs. */
  get slots() {
    return (this.groups + 1) * 2;
  }

  /** The instruction at a program counter. */
  at(counter) {
    return this.instructions[counter];
  }

  /** How many instructions of each kind there are. */
  histogram() {
    const counts = {};
    for (const instruction of this.instructions) {
      counts[instruction.op] = (counts[instruction.op] ?? 0) + 1;
    }
    return counts;
  }

  /** One instruction as text, without its index. */
  static show(instruction, describeClass = (ranges) => `${ranges.length} ranges`) {
    switch (instruction.op) {
      case Op.CHAR:
        return `char    ${JSON.stringify(instruction.char)}`;
      case Op.CLASS:
        return `class   ${instruction.negated ? '^' : ''}[${describeClass(instruction.ranges)}]`;
      case Op.ANY:
        return `any     ${instruction.dotAll ? '(including newline)' : '(except newline)'}`;
      case Op.SPLIT:
        return `split   ${instruction.x}, ${instruction.y}`;
      case Op.JMP:
        return `jmp     ${instruction.target}`;
      case Op.SAVE:
        return `save    ${instruction.slot}`;
      case Op.ASSERT:
        return `assert  ${instruction.kind}`;
      case Op.MATCH:
        return 'match';
      default:
        return `?       ${instruction.op}`;
    }
  }

  /** The whole program, one numbered instruction per line. */
  disassemble(describeClass) {
    return this.instructions
      .map((instruction, index) => {
        const number = String(index).padStart(3, ' ');
        return `${number}  ${Program.show(instruction, describeClass)}`;
      })
      .join('\n');
  }

  /** The program as plain data, for `--json`. */
  toJSON() {
    return {
      source: this.source,
      flags: this.flags,
      groups: this.groups,
      anchoredStart: this.anchoredStart,
      instructions: this.instructions,
    };
  }
}
