// scripts/check-syntax.js
//
// Syntax-checks every JavaScript source file with Node's own parser. Gives
// the project a dependency-free lint gate: no ESLint, no config drift, and it
// runs anywhere Node runs.

import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const roots = ['src', 'scripts', 'tests'];
const extensions = new Set(['.js', '.mjs']);

/**
 * Collect every JavaScript file beneath a directory.
 *
 * @param {string} dir Absolute directory to walk.
 * @returns {string[]} Absolute file paths.
 */
function collect(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue;
      out.push(...collect(full));
    } else if (extensions.has(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

const files = roots.flatMap((dir) => collect(join(root, dir)));
const failures = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (error) {
    failures.push({ file: relative(root, file), message: String(error.stderr || error.message).trim() });
  }
}

for (const failure of failures) {
  console.error(`FAIL ${failure.file}`);
  console.error(failure.message);
}

console.log(`checked ${files.length} file(s), ${failures.length} failure(s)`);
process.exit(failures.length === 0 ? 0 : 1);
