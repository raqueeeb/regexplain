/**
 * The command line.
 *
 * Every command takes a pattern and prints something about it. The shape is
 * always the same — parse the arguments, do the work, render it — and the
 * rendering lives in `render.js`, so this file reads as a list of what the
 * tool can be asked.
 *
 * `run` returns an exit code and writes through an injected `out` and `err`,
 * which is what lets the tests drive the whole command line without starting
 * a process or capturing a stream.
 */

import { analyse } from './analyse.js';
import { compile, normalizeFlags } from './compile.js';
import { explainFlags, sentence } from './explain.js';
import { PatternError } from './syntax-error.js';
import { groupsOf } from './ast.js';
import { parse } from './parser.js';
import { search, searchAll } from './vm.js';
import {
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
} from './render.js';

/** The version, kept in step with package.json by a test. */
export const VERSION = '1.0.0';

/** What the tool can be asked to do. */
export const COMMANDS = {
  explain: 'describe a pattern in words and as a tree',
  match: 'match a pattern against a text and show the captures',
  all: 'show every non-overlapping match in a text',
  trace: 'show the thread list at each input position',
  compile: 'disassemble a pattern into the program the machine runs',
  cost: 'report the size of a pattern and anything worth warning about',
  help: 'print this help',
  version: 'print the version',
};

/** The usage text. */
export function usage() {
  const rows = Object.entries(COMMANDS).map(([name, about]) => [`  ${name}`, about]);

  return [
    'regexplain - a regular expression engine that explains itself',
    '',
    'Usage:',
    '  regexplain <command> <pattern> [text] [options]',
    '',
    'Commands:',
    table(rows),
    '',
    'Options:',
    table([
      ['  -f, --flags <set>', 'any of i (ignore case), s (dot matches newline), m (multiline)'],
      ['  -j, --json', 'print the result as JSON'],
      ['      --no-color', 'never colour the output'],
      ['      --color', 'colour the output even when it is not a terminal'],
      ['  -h, --help', 'print this help'],
    ]),
    '',
    'Examples:',
    '  regexplain explain "^(\\d{4})-(\\d{2})$"',
    '  regexplain match "(\\w+)@(\\w+)" "mail bob@example"',
    '  regexplain trace "a+b" "aab"',
    '  regexplain cost "(a+)+b"',
    '',
    'This engine has no backreferences and no lookaround, on purpose: both',
    'need backtracking, and backtracking is what makes a regex able to hang.',
  ].join('\n');
}

/** Splits argv into a command, positional arguments and options. */
export function parseArgs(argv) {
  const options = { flags: '', json: false, colour: null };
  const positional = [];
  const rest = [...argv];

  while (rest.length > 0) {
    const argument = rest.shift();

    switch (argument) {
      case '-f':
      case '--flags':
        options.flags = rest.shift() ?? '';
        break;
      case '-j':
      case '--json':
        options.json = true;
        break;
      case '--color':
        options.colour = true;
        break;
      case '--no-color':
        options.colour = false;
        break;
      case '-h':
      case '--help':
        positional.unshift('help');
        break;
      case '-V':
      case '--version':
        positional.unshift('version');
        break;
      default:
        if (argument.startsWith('--flags=')) options.flags = argument.slice('--flags='.length);
        else if (argument.startsWith('-') && argument.length > 1 && !positional.length) {
          options.unknown = argument;
        } else positional.push(argument);
    }
  }

  return { command: positional[0] ?? 'help', positional: positional.slice(1), options };
}

/** Runs the command line and returns an exit code. */
export function run(argv, io = {}) {
  const out = io.out ?? ((text) => process.stdout.write(`${text}\n`));
  const err = io.err ?? ((text) => process.stderr.write(`${text}\n`));
  const { command, positional, options } = parseArgs(argv);
  const colour = options.colour ?? Boolean(io.tty);

  if (options.unknown) {
    err(`regexplain: ${options.unknown} is not an option`);
    err("try 'regexplain help'");
    return 2;
  }

  if (command === 'help') {
    out(usage());
    return 0;
  }
  if (command === 'version') {
    out(VERSION);
    return 0;
  }
  if (!(command in COMMANDS)) {
    err(`regexplain: '${command}' is not a command`);
    err("try 'regexplain help'");
    return 2;
  }

  const [pattern, text] = positional;
  if (pattern === undefined) {
    err(`regexplain: ${command} needs a pattern`);
    return 2;
  }
  if ((command === 'match' || command === 'trace' || command === 'all') && text === undefined) {
    err(`regexplain: ${command} needs a pattern and a text`);
    return 2;
  }

  try {
    return dispatch(command, pattern, text, { ...options, colour }, out);
  } catch (caught) {
    if (!(caught instanceof PatternError)) throw caught;
    if (options.json) {
      out(JSON.stringify(caught.toJSON(), null, 2));
      return 1;
    }
    const paint = palette(colour);
    err(`regexplain: ${paint.red(caught.message)}`);
    err(caret(caught.pattern, caught.offset, colour));
    return 1;
  }
}

/** Does the work for one command. */
function dispatch(command, pattern, text, options, out) {
  switch (command) {
    case 'explain':
      return explainCommand(pattern, options, out);
    case 'match':
      return matchCommand(pattern, text, options, out);
    case 'all':
      return allCommand(pattern, text, options, out);
    case 'trace':
      return traceCommand(pattern, text, options, out);
    case 'compile':
      return compileCommand(pattern, options, out);
    case 'cost':
      return costCommand(pattern, options, out);
    default:
      return 2;
  }
}

/** `explain` */
export function explainCommand(pattern, options, out) {
  const tree = parse(pattern);
  const flags = normalizeFlags(options.flags, pattern);

  if (options.json) {
    out(
      JSON.stringify(
        {
          pattern,
          flags: flags.text,
          sentence: sentence(tree),
          groups: groupsOf(tree).map((group) => ({ index: group.index, name: group.name })),
          tree,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  out(heading(`/${pattern}/${flags.text}`, options.colour));
  out('');
  out(renderSentence(tree));
  out('');
  out(heading('Structure', options.colour));
  out(renderTree(tree));

  const groups = groupsOf(tree);
  if (groups.length > 0) {
    out('');
    out(heading('Captures', options.colour));
    out(
      table(
        groups.map((group) => [
          String(group.index),
          group.name ?? palette(options.colour).dim('unnamed'),
        ]),
      ),
    );
  }

  const meanings = explainFlags(flags.text);
  if (meanings.length > 0) {
    out('');
    out(heading('Flags', options.colour));
    out(table(meanings.map((each) => [each.flag, each.means])));
  }

  return 0;
}

/** `match` */
export function matchCommand(pattern, text, options, out) {
  const program = compile(pattern, options.flags);
  const result = search(program, text);

  if (options.json) {
    out(
      JSON.stringify(
        {
          pattern,
          flags: program.flags,
          input: text,
          matched: result.matched,
          index: result.index,
          end: result.end,
          text: result.text,
          groups: result.groups,
          steps: result.steps,
        },
        null,
        2,
      ),
    );
    return result.matched ? 0 : 1;
  }

  out(renderMatch(result, text, options.colour));
  return result.matched ? 0 : 1;
}

/** `all` */
export function allCommand(pattern, text, options, out) {
  const program = compile(pattern, options.flags);
  const results = searchAll(program, text);

  if (options.json) {
    out(
      JSON.stringify(
        {
          pattern,
          input: text,
          count: results.length,
          matches: results.map((result) => ({
            index: result.index,
            end: result.end,
            text: result.text,
            groups: result.groups,
          })),
        },
        null,
        2,
      ),
    );
    return results.length > 0 ? 0 : 1;
  }

  if (results.length === 0) {
    out(palette(options.colour).red('no match'));
    return 1;
  }

  const rows = [['#', 'span', 'text']];
  results.forEach((result, index) => {
    rows.push([String(index + 1), `${result.index}–${result.end}`, JSON.stringify(result.text)]);
  });
  out(table(rows, { align: ['right'] }));
  out('');
  out(`${results.length} match${results.length === 1 ? '' : 'es'}`);
  return 0;
}

/** `trace` */
export function traceCommand(pattern, text, options, out) {
  const program = compile(pattern, options.flags);
  const result = search(program, text, { trace: true });

  if (options.json) {
    out(JSON.stringify({ pattern, input: text, matched: result.matched, trace: result.trace }, null, 2));
    return result.matched ? 0 : 1;
  }

  out(heading(`/${pattern}/${program.flags} against ${JSON.stringify(text)}`, options.colour));
  out('');
  out(renderTrace(result, text, options.colour));
  out('');
  out(renderMatch(result, text, options.colour));
  return result.matched ? 0 : 1;
}

/** `compile` */
export function compileCommand(pattern, options, out) {
  const program = compile(pattern, options.flags);

  if (options.json) {
    out(JSON.stringify(program.toJSON(), null, 2));
    return 0;
  }

  out(heading(`/${pattern}/${program.flags}`, options.colour));
  out('');
  out(renderProgram(program, options.colour));
  out('');
  out(`${program.length} instructions, ${program.groups} capturing group${program.groups === 1 ? '' : 's'}`);
  return 0;
}

/** `cost` */
export function costCommand(pattern, options, out) {
  const tree = parse(pattern);
  const program = compile(pattern, options.flags);
  const report = analyse(tree, program);

  if (options.json) {
    out(JSON.stringify(report, null, 2));
    return report.findings.some((each) => each.severity === 'warning') ? 1 : 0;
  }

  out(heading(`/${pattern}/${program.flags}`, options.colour));
  out('');
  out(renderAnalysis(report, options.colour));
  return report.findings.some((each) => each.severity === 'warning') ? 1 : 0;
}
