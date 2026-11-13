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
