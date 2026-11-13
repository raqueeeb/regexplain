#!/usr/bin/env node
/**
 * A small house-style check.
 *
 * There is no dependency here on purpose: the whole engine has none, and a
 * linter would be the first. What this checks is only what has actually gone
 * wrong in this repository — a stray debugging print, a line that has grown
 * past reading width, a file that forgot its doc comment. It is not a
 * replacement for a real linter and does not pretend to be one.
 *
 * A line ending in `// lint-allow` is left alone, which is how this file
 * manages to hold a list of the things it forbids.
 *
 * Usage: `node tools/lint.js [paths...]` (default: `src`, `test` and `tools`)
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/** The longest line we allow. Comments and code both count. */
const MAX_LINE = 110;

/** The deepest indentation that still reads as structure rather than a maze. */
const MAX_INDENT = 12;
