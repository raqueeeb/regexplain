/**
 * Terminal output.
 *
 * Everything a command prints is built here, so the commands themselves are
 * about what to say and this file is about how it looks. Colour is optional
 * and off whenever output is not a terminal, because a pipe full of escape
 * codes is nobody's idea of a result.
 */

import { describe } from './ranges.js';
import { Program } from './program.js';
import { childrenOf } from './ast.js';
import { sentence, summarise } from './explain.js';

/** The escape codes, or nothing at all when colour is off. */
export function palette(colour) {
  const code = (open) => (text) => (colour ? `\u001b[${open}m${text}\u001b[0m` : String(text));
  return {
    bold: code('1'),
    dim: code('2'),
    red: code('31'),
    green: code('32'),
    yellow: code('33'),
    blue: code('36'),
    plain: (text) => String(text),
  };
}

/**
 * The tree as box-drawing lines.
 *
 * The last child of a node gets a corner and the others get a tee, and a
 * child's own children are indented under a bar only while the branch above
 * them continues. Getting that right is the difference between a tree you
 * can follow and a list of dashes.
 */
export function treeLines(node, prefix = '', isLast = true, isRoot = true) {
  const lines = [];
  const connector = isRoot ? '' : `${isLast ? '└─ ' : '├─ '}`;
  lines.push(`${prefix}${connector}${summarise(node)}`);

  const children = childrenOf(node);
  const childPrefix = isRoot ? '' : `${prefix}${isLast ? '   ' : '│  '}`;

  children.forEach((child, index) => {
    lines.push(...treeLines(child, childPrefix, index === children.length - 1, false));
  });

  return lines;
}

/** The tree as a box-drawing outline. */
export function renderTree(tree) {
  return treeLines(tree).join('\n');
}

/** A heading with a rule under it. */
export function heading(text, colour) {
  const paint = palette(colour);
  return `${paint.bold(text)}\n${paint.dim('─'.repeat(text.length))}`;
}

/** The pattern with a caret under one offset. */
export function caret(pattern, offset, colour) {
  const paint = palette(colour);
  return `  ${pattern}\n  ${' '.repeat(Math.max(0, offset))}${paint.red('^')}`;
}

/** A table from rows of cells, padded into columns. */
export function table(rows, options = {}) {
  if (rows.length === 0) return '';
  const widths = [];

  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.max(widths[index] ?? 0, String(cell).length);
    });
  }

  const align = options.align ?? [];
  return rows
    .map((row) =>
      row
        .map((cell, index) => {
          const text = String(cell);
          // The last column is never padded: trailing spaces on a line are
          // invisible and only make the output harder to diff.
          if (index === row.length - 1) return text;
          return align[index] === 'right'
            ? text.padStart(widths[index])
            : text.padEnd(widths[index]);
        })
        .join(options.gap ?? '  ')
        .trimEnd(),
    )
    .join('\n');
}

/** The disassembly, with classes described rather than counted. */
export function renderProgram(program, colour) {
  const paint = palette(colour);
  const rows = program.instructions.map((instruction, index) => [
    paint.dim(String(index).padStart(3)),
    Program.show(instruction, (ranges) => describe(ranges)),
  ]);
  return table(rows);
}

/** One match result. */
export function renderMatch(result, input, colour) {
  const paint = palette(colour);

  if (!result.matched) {
    return `${paint.red('no match')}`;
  }

  const characters = Array.from(input);
  const before = characters.slice(0, result.index).join('');
  const matched = characters.slice(result.index, result.end).join('');
  const after = characters.slice(result.end).join('');

  const lines = [
    `${paint.green('match')} at ${result.index}–${result.end}`,
    `  ${paint.dim(before)}${paint.bold(matched === '' ? '∅' : matched)}${paint.dim(after)}`,
  ];

  if (result.groups.length > 0) {
    lines.push('');
    const rows = [['group', 'span', 'text']];
    for (const group of result.groups) {
      const label = group.name ? `${group.index} (${group.name})` : String(group.index);
      const span = group.start === null ? '—' : `${group.start}–${group.end}`;
      const shown = group.text === null
        ? paint.dim('did not take part')
        : JSON.stringify(group.text);
      rows.push([label, span, shown]);
    }
    lines.push(table(rows));
  }

  return lines.join('\n');
}

/** The thread list at each input position. */
export function renderTrace(result, input, colour) {
  const paint = palette(colour);
  const rows = [['pos', 'char', 'threads', 'program counters']];

  for (const step of result.trace) {
    rows.push([
      String(step.position),
      step.character === null ? paint.dim('end') : JSON.stringify(step.character),
      String(step.threads),
      step.counters.join(' '),
    ]);
  }

  const summary = [
    '',
    `${result.trace.length} positions, ${result.steps} thread additions, `
      + `at most ${result.peakThreads} threads alive at once`,
  ];

  return [table(rows, { align: ['right', 'left', 'right'] }), ...summary].join('\n');
}

/** The cost report. */
export function renderAnalysis(report, colour) {
  const paint = palette(colour);

  const rows = [
    ['instructions', String(report.instructions)],
    ['of which consume input', String(report.consuming)],
    ['branches', String(report.splits)],
    ['capture slots', String(report.saves)],
    ['assertions', String(report.asserts)],
    ['capturing groups', String(report.groups)],
    ['tree nodes', String(report.nodes.total)],
    ['anchored at the start', report.anchoredStart ? 'yes' : 'no'],
    ['can match empty', report.nullable ? 'yes' : 'no'],
  ];

  const lines = [table(rows)];

  lines.push(
    '',
    `Worst case here: ${report.instructions} instructions x (n + 1) steps, `
      + 'which is linear in the length of the input.',
  );

  if (report.findings.length === 0) {
    lines.push('', paint.green('nothing to warn about'));
    return lines.join('\n');
  }

  lines.push('');
  for (const finding of report.findings) {
    const mark = finding.severity === 'warning' ? paint.yellow('warning') : paint.blue('note');
    lines.push(`${mark}  ${finding.what}`);
    if (finding.detail) lines.push(`         ${paint.dim(finding.detail)}`);
    for (const line of wrap(finding.why, 68)) lines.push(`         ${line}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}
)}
