# regexplain

A regular expression engine that explains itself — and that cannot hang.

```console
$ regexplain explain '^(\d{4})-(\d{2})$'
/^(\d{4})-(\d{2})$/
───────────────────

This matches the start of the text, a digit, exactly 4 times (captured
as group 1), '-', a digit, exactly 2 times (captured as group 2), then
the end of the text.

Structure
─────────
5 things in a row
├─ the start of the text
├─ a group captured as number 1
│  └─ exactly 4 times
│     └─ a digit
├─ the character '-'
├─ a group captured as number 2
│  └─ exactly 2 times
│     └─ a digit
└─ the end of the text
```

No dependencies. No `RegExp` underneath — the parser, the compiler and the
matching are all here, which is what makes it possible to show the program
and the threads rather than only the answer.

## Install

```sh
git clone https://github.com/raqueeeb/regexplain
cd regexplain
npm link        # or just run: node bin/regexplain.js
```

Node 20 or newer. Nothing to install.

## The commands

| Command | What it does |
| --- | --- |
| `explain <pattern>` | the pattern in words, and its structure as a tree |
| `match <pattern> <text>` | where it matched and what each group captured |
| `all <pattern> <text>` | every non-overlapping match |
| `trace <pattern> <text>` | the thread list at each input position |
| `compile <pattern>` | the program the machine actually runs |
| `cost <pattern>` | how big the pattern is, and anything worth warning about |

Options: `-f, --flags <set>` (`i` ignore case, `s` dot matches newline, `m`
multiline), `-j, --json`, `--color` / `--no-color`.

Exit codes are meant for scripts: `0` on success, `1` when there is no match
or a pattern is bad, `2` when the command line itself is wrong. `cost` exits
`1` when it finds a warning, so it can be used in a hook.

## Why it cannot hang

This is a **Pike virtual machine**. A pattern is compiled to a flat list of
instructions, and every thread that is still alive runs in lock-step, one
input character at a time:

```console
$ regexplain trace 'a+b' 'aab'
pos  char  threads  program counters
  0  "a"         1  1
  1  "a"         2  1 3
  2  "b"         2  1 3
  3  end         2  5 1

4 positions, 14 thread additions, at most 2 threads alive at once
```

The thread list cannot hold the same program counter twice: a position
already reached cannot be reached again, because a second visit could only
repeat what the first will do. So the list never grows past the number of
instructions, and a search looks at each character at most once per
instruction — **O(n·m), with no input that makes it worse.**

A backtracking engine — JavaScript's own `RegExp`, PCRE, Python's `re` — has
no such bound. The difference is not academic:

```console
$ regexplain cost '(a+)+b'
instructions            9
...
Worst case here: 9 instructions x (n + 1) steps, which is linear in the
length of the input.

warning  a quantifier inside a quantifier
         + inside +
         a backtracking engine can take time exponential in the length of
         the input on this shape. This engine cannot, but the pattern is
         still a trap anywhere else.
```

That pattern against thirty `a`s and no `b` takes this engine 213 thread
additions. The same pattern in a backtracking engine takes on the order of
2³⁰ steps and appears to hang. `cost` finds the shape and names it, because
the pattern that is safe here is still the one that takes a server down when
somebody copies it into another language.

## What it will not do

**No backreferences. No lookahead or lookbehind.** Both need backtracking,
and backtracking is exactly what the linear-time guarantee gives up. The
parser refuses them with the reason rather than accepting them and quietly
matching something else:

```console
$ regexplain match '(a)\1' 'aa'
regexplain: a backreference is not supported: matching one needs
backtracking, which is what this engine exists to avoid
  (a)\1
  ^
```

If you need those, you need a different kind of engine — and you should know
that you are paying for them.

## What it will do

Literals, `.`, `|`, groups `(...)`, non-capturing `(?:...)`, named
`(?<name>...)`, classes `[a-z^-]` with ranges and negation, the named classes
`\d \w \s \D \W \S`, anchors `^ $ \b \B`, the quantifiers `* + ? {n} {n,}
{n,m}` each in a greedy and a lazy form, the escapes `\n \t \r \f \v \0 \xNN
\uNNNN \u{NNNNN}`, and the flags `i`, `s` and `m`.

Matching is **leftmost-first**, like PCRE and unlike POSIX: `a|ab` against
`ab` matches `a`, because the alternation prefers the option written first.
`regexplain explain` says so in as many words.

Positions are counted in **code points**, not UTF-16 units, so an astral
character is one character and not two.

## As a library

```js
import { compile, search, parse, sentence, analyse } from 'regexplain';

const program = compile('(?<user>\\w+)@(?<host>\\w+)', 'i');
const result = search(program, 'write to Bob@Example now');

result.text;                  // 'Bob@Example'
result.groups[0].name;         // 'user'
result.groups[0].text;         // 'Bob'
result.steps;                  // how much work it took

sentence(parse('a+b'));        // "'a', one or more times, ... then 'b'"
analyse(parse('(a+)+'), program).findings;   // the warnings
```

`search` takes `{ trace: true }` to record the thread list per position, and
`searchAll` returns every non-overlapping match.

## Tests

```sh
node --test test/*.test.js     # 355 tests
node tools/lint.js             # house style
npm run check                  # both
```

No test framework and nothing to install: `node --test` is the runner and
the linter is a hundred lines in `tools/lint.js`.

## Licence

MIT.
