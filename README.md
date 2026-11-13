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
