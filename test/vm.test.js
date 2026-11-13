/**
 * Matching.
 *
 * These are the tests that say what the engine actually does, so they are
 * written as the thing a user would type: a pattern, an input, and the text
 * that should come back. Preference order gets its own section, because
 * `a|ab` matching `a` rather than `ab` is a decision and not an accident.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Machine, search, searchAll, test as matches } from '../src/vm.js';
import { compile } from '../src/compile.js';

/** The text a pattern matches in an input, or `null`. */
function found(pattern, input, flags = '') {
  const result = search(compile(pattern, flags), input);
  return result.matched ? result.text : null;
}

/** The captures of a match, as text. */
function captures(pattern, input, flags = '') {
  return search(compile(pattern, flags), input).groups.map((group) => group.text);
}

// ---- literals ----

test('a literal matches itself', () => {
  assert.equal(found('abc', 'abc'), 'abc');
});

test('a literal is found inside a longer text', () => {
  assert.equal(found('abc', 'xxabcyy'), 'abc');
});

test('a literal that is not there does not match', () => {
  assert.equal(found('abc', 'abd'), null);
});

test('an empty pattern matches the empty string at the start', () => {
  const result = search(compile(''), 'abc');
  assert.equal(result.matched, true);
  assert.equal(result.index, 0);
  assert.equal(result.end, 0);
});

test('a pattern matches the empty input when it can', () => {
  assert.equal(found('a*', ''), '');
  assert.equal(found('a', ''), null);
});

// ---- the dot ----

test('a dot matches any character but a newline', () => {
  assert.equal(found('a.c', 'abc'), 'abc');
  assert.equal(found('a.c', 'a c'), 'a c');
  assert.equal(found('a.c', 'a\nc'), null);
});

test('the s flag lets a dot match a newline', () => {
  assert.equal(found('a.c', 'a\nc', 's'), 'a\nc');
});

// ---- quantifiers ----

test('a star matches nothing at all', () => {
  assert.equal(found('xa*', 'x'), 'x');
});

test('a greedy quantifier takes as much as it can', () => {
  assert.equal(found('a+', 'caaab'), 'aaa');
  assert.equal(found('a*', 'aaa'), 'aaa');
});

test('a lazy quantifier takes as little as it can', () => {
  assert.equal(found('a+?', 'caaab'), 'a');
  assert.equal(found('a*?', 'aaa'), '');
});

test('greedy and lazy differ only in what they prefer, not in what they can match', () => {
  assert.equal(found('<.+>', '<a><b>'), '<a><b>');
  assert.equal(found('<.+?>', '<a><b>'), '<a>');
});

test('an optional part may be absent', () => {
  assert.equal(found('colou?r', 'color'), 'color');
  assert.equal(found('colou?r', 'colour'), 'colour');
});

test('an exact count matches exactly that many', () => {
  assert.equal(found('a{2}', 'aaaa'), 'aa');
  assert.equal(found('a{5}', 'aaaa'), null);
});

test('a counted range prefers the longest within it', () => {
  assert.equal(found('a{2,3}', 'aaaa'), 'aaa');
  assert.equal(found('a{2,3}?', 'aaaa'), 'aa');
});

test('an open-ended count has no upper limit', () => {
  assert.equal(found('a{2,}', 'aaaaa'), 'aaaaa');
  assert.equal(found('a{2,}', 'a'), null);
});

test('a quantified group repeats the whole group', () => {
  assert.equal(found('(ab)+', 'ababab'), 'ababab');
  assert.equal(found('(?:ab)+', 'ababX'), 'abab');
});

// ---- alternation ----

test('an alternation matches either side', () => {
  assert.equal(found('cat|dog', 'a dog'), 'dog');
  assert.equal(found('cat|dog', 'a cat'), 'cat');
});

test('an alternation prefers the earlier option, even when it is shorter', () => {
  // This is leftmost-first, not leftmost-longest: the order of the options
  // in the pattern decides.
  assert.equal(found('a|ab', 'ab'), 'a');
  assert.equal(found('ab|a', 'ab'), 'ab');
});

test('an alternation inside a concatenation only covers its own part', () => {
  assert.equal(found('^(a|b)c$', 'bc'), 'bc');
});

test('an empty option can match nothing', () => {
  assert.equal(found('x(a|)y', 'xy'), 'xy');
});

// ---- classes ----

test('a class matches any member', () => {
  assert.equal(found('[abc]+', 'zzcabzz'), 'cab');
});

test('a negated class matches anything else', () => {
  assert.equal(found('[^abc]+', 'abzzc'), 'zz');
});

test('a range in a class matches the whole range', () => {
  assert.equal(found('[a-f]+', 'xxabcfxx'), 'abcf');
});

test('the named classes match what they name', () => {
  assert.equal(found('\\d+', 'abc123'), '123');
  assert.equal(found('\\w+', ' hi_there! '), 'hi_there');
  assert.equal(found('\\s+', 'a  b'), '  ');
});

test('the negated named classes match the complement', () => {
  assert.equal(found('\\D+', '12ab34'), 'ab');
  assert.equal(found('\\W+', 'ab--cd'), '--');
  assert.equal(found('\\S+', '  ab  '), 'ab');
});

// ---- anchors ----

test('a caret pins a match to the start', () => {
  assert.equal(found('^abc', 'abcdef'), 'abc');
  assert.equal(found('^abc', 'xabc'), null);
});

test('a dollar pins a match to the end', () => {
  assert.equal(found('abc$', 'xxabc'), 'abc');
  assert.equal(found('abc$', 'abcx'), null);
});

test('both anchors together mean the whole text', () => {
  assert.equal(found('^abc$', 'abc'), 'abc');
  assert.equal(found('^abc$', 'abcd'), null);
});

test('without the m flag an anchor ignores newlines', () => {
  assert.equal(found('^b', 'a\nb'), null);
  assert.equal(found('a$', 'a\nb'), null);
});

test('with the m flag an anchor matches at every line', () => {
  assert.equal(found('^b', 'a\nb', 'm'), 'b');
  assert.equal(found('a$', 'a\nb', 'm'), 'a');
});

test('a word boundary sits between a word character and anything else', () => {
  assert.equal(found('\\bcat\\b', 'a cat here'), 'cat');
  assert.equal(found('\\bcat\\b', 'concatenate'), null);
});

test('a word boundary matches at the ends of the text', () => {
  assert.equal(found('\\bcat', 'cat'), 'cat');
  assert.equal(found('cat\\b', 'cat'), 'cat');
});

test('a negated word boundary is the positions a boundary is not', () => {
  assert.equal(found('\\Bcat', 'concat'), 'cat');
  assert.equal(found('\\Bcat', 'a cat'), null);
});

// ---- flags ----

test('the i flag matches either case', () => {
  assert.equal(found('abc', 'xABCx', 'i'), 'ABC');
  assert.equal(found('abc', 'xABCx'), null);
});

test('the i flag applies inside a class', () => {
  assert.equal(found('[a-c]+', 'ABC', 'i'), 'ABC');
});

test('the i flag applies to a negated class', () => {
  assert.equal(found('[^a-c]+', 'ABCxy', 'i'), 'xy');
});

test('flags can be combined', () => {
  assert.equal(found('^a.b$', 'A\nB', 'is'), 'A\nB');
});

// ---- captures ----

test('a group captures what it matched', () => {
  assert.deepEqual(captures('(a)(b)', 'ab'), ['a', 'b']);
});

test('captures report their positions', () => {
  const result = search(compile('x(\\d+)y'), 'ax123yb');
  assert.deepEqual(
    result.groups.map((group) => [group.start, group.end]),
    [[2, 5]],
  );
});

test('a group that did not take part captures nothing', () => {
  assert.deepEqual(captures('(a)|(b)', 'b'), [null, 'b']);
});

test('a group inside a repetition keeps its last turn', () => {
  assert.deepEqual(captures('(?:(a)|(b))+', 'ab'), ['a', 'b']);
});

test('a nested group captures independently', () => {
  assert.deepEqual(captures('((a)b)', 'ab'), ['ab', 'a']);
});

test('a named group keeps its name in the result', () => {
  const result = search(compile('(?<word>[a-z]+)'), 'hi');
  assert.equal(result.groups[0].name, 'word');
});

test('a non-capturing group captures nothing at all', () => {
  assert.deepEqual(captures('(?:ab)', 'ab'), []);
});

test('an optional group can capture the empty string, which is not nothing', () => {
  assert.deepEqual(captures('a(b*)c', 'ac'), ['']);
});

// ---- several matches ----

test('every match is found left to right', () => {
  const all = searchAll(compile('\\d+'), 'a1 b22 c333');
  assert.deepEqual(all.map((result) => result.text), ['1', '22', '333']);
});

test('matches do not overlap', () => {
  const all = searchAll(compile('aa'), 'aaaa');
  assert.deepEqual(all.map((result) => result.index), [0, 2]);
});

test('an empty match still moves forward rather than looping', () => {
  const all = searchAll(compile('a*'), 'baa');
  assert.deepEqual(all.map((result) => result.text), ['', 'aa', '']);
});

test('finding nothing gives an empty list', () => {
  assert.deepEqual(searchAll(compile('z'), 'abc'), []);
});

// ---- test ----

test('test answers only whether there is a match', () => {
  assert.equal(matches(compile('a+'), 'xax'), true);
  assert.equal(matches(compile('z'), 'xax'), false);
});

// ---- starting position ----

test('a search can start part way through', () => {
  const result = search(compile('a'), 'aXa', { start: 1 });
  assert.equal(result.index, 2);
});

test('a caret still means the start of the text, not the start offset', () => {
  // Searching from an offset does not move where `^` matches, which is the
  // same decision Python's `re` makes about its `pos` argument. Otherwise
  // scanning a text in pieces would silently change what the pattern means.
  assert.equal(search(compile('^a'), 'ba', { start: 1 }).matched, false);
  assert.equal(search(compile('^b'), 'ba', { start: 0 }).matched, true);
});

// ---- the linear-time guarantee ----

test('a nested quantifier takes linear work, not exponential', () => {
  // This is the pattern that hangs a backtracking engine. Doubling the
  // input should roughly double the work and nothing worse.
  const program = compile('(a+)+b');
  const small = search(program, 'a'.repeat(100)).steps;
  const large = search(program, 'a'.repeat(200)).steps;
  assert.ok(large < small * 3, `${small} then ${large} is not linear`);
});

test('the work is bounded by the program size times the input length', () => {
  const program = compile('(a|aa)+c');
  const input = 'a'.repeat(500);
  const result = search(program, input);
  assert.equal(result.matched, false);
  assert.ok(result.steps <= program.length * (input.length + 1));
});

test('no more threads are alive than the program has instructions', () => {
  const program = compile('(a|b|c)+d');
  const result = search(program, 'abcabcabc');
  assert.ok(result.peakThreads <= program.length);
});

test('a repetition of something nullable terminates', () => {
  assert.equal(found('(a*)*b', 'aaab'), 'aaab');
  assert.equal(found('(a*)*', ''), '');
});

// ---- code points ----

test('an astral character counts as one character', () => {
  const result = search(compile('.'), '\u{1F600}a');
  assert.equal(result.text, '\u{1F600}');
  assert.equal(result.end, 1);
});

test('positions are code-point offsets, not string indices', () => {
  const result = search(compile('a'), '\u{1F600}a');
  assert.equal(result.index, 1);
});

// ---- the trace ----

test('a trace has one entry per input position considered', () => {
  const result = search(compile('a+b'), 'aab', { trace: true });
  assert.equal(result.trace.length, 4);
  assert.equal(result.trace[0].position, 0);
});

test('a trace records the program counters that were alive', () => {
  const result = search(compile('ab'), 'ab', { trace: true });
  assert.ok(result.trace.every((step) => Array.isArray(step.counters)));
});

test('a trace is empty unless it was asked for', () => {
  assert.deepEqual(search(compile('a'), 'a').trace, []);
});

test('a machine can be used directly', () => {
  const machine = new Machine(compile('a+'));
  const result = machine.run('aaa');
  assert.equal(result.text, 'aaa');
  assert.ok(machine.steps > 0);
});

// ---- patterns somebody would actually write ----

test('a date pattern pulls a date apart', () => {
  const result = search(compile('^(\\d{4})-(\\d{2})-(\\d{2})$'), '2026-11-13');
  assert.deepEqual(result.groups.map((group) => group.text), ['2026', '11', '13']);
});

test('an address pattern pulls an address apart', () => {
  const result = search(compile('(?<user>[\\w.]+)@(?<host>[\\w.]+)'), 'write to bob.smith@example.com now');
  assert.equal(result.groups[0].text, 'bob.smith');
  assert.equal(result.groups[1].text, 'example.com');
});

test('a quoted-string pattern stops at the first closing quote', () => {
  assert.equal(found('"[^"]*"', 'a "one" and "two"'), '"one"');
});

test('a number pattern reads a decimal', () => {
  assert.equal(found('-?\\d+(\\.\\d+)?', 'x -12.75 y'), '-12.75');
});

test('a hex colour pattern checks its length', () => {
  const program = compile('^#(?:[0-9a-f]{3}|[0-9a-f]{6})$', 'i');
  assert.equal(matches(program, '#FFF'), true);
  assert.equal(matches(program, '#ff8800'), true);
  assert.equal(matches(program, '#ff88'), false);
});
