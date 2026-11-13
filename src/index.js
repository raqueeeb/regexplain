/**
 * The library surface.
 *
 * Everything the command line uses is exported here, so the engine can be
 * used without the command line: parse a pattern, compile it, run it.
 */

export {
  Anchor,
  NodeType,
  childrenOf,
  depthOf,
  groupsOf,
  isNullable,
  sizeOf,
  walk,
} from './ast.js';

export { MAX_DEPTH, MAX_REPEAT, Parser, parse, parses } from './parser.js';
export { PatternError } from './syntax-error.js';

export {
  MAX_PROGRAM,
  Compiler,
  compile,
  compileTree,
  foldCase,
  normalizeFlags,
  startsAnchored,
} from './compile.js';

export { Op, Program, consumes } from './program.js';
export { Machine, isWord, search, searchAll, test } from './vm.js';

export {
  describeClass,
  describeRepeat,
  explainFlags,
  outline,
  quote,
  sentence,
  summarise,
} from './explain.js';

export {
  Severity,
  analyse,
  bound,
  countNodes,
  findings,
  firstSetSize,
  nestedQuantifiers,
  nullableRepeats,
} from './analyse.js';

export {
  MAX_CODE_POINT,
  NAMED,
  contains,
  describe,
  describeCode,
  invert,
  namedClass,
  normalize,
  range,
  size,
  union,
} from './ranges.js';

export { COMMANDS, VERSION, parseArgs, run, usage } from './cli.js';

export {
  caret,
  heading,
  palette,
  renderAnalysis,
  renderMatch,
  renderProgram,
  renderSentence,
  renderTrace,
  renderTree,
  table,
  treeLines,
  wrap,
} from './render.js';
