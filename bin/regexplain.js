#!/usr/bin/env node
/**
 * The entry point.
 *
 * Nothing but argument handling and an exit code: the work is in
 * `src/cli.js`, which the tests drive directly.
 */

import process from 'node:process';

import { run } from '../src/cli.js';

process.exitCode = run(process.argv.slice(2), {
  tty: Boolean(process.stdout.isTTY),
});
