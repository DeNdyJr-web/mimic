// Recursively validates every locale JSON file against en.json.
// Checks: parseability, missing keys, extra keys, structural mismatches (nested shape),
// leaf type mismatches, and that template.json leaves are all empty strings.
// Zero dependencies — uses only Node built-ins. Run via `npm run validate:locales`.

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOCALES_DIR = join(__dirname, '..', 'src', 'locales');
const BASELINE = join(LOCALES_DIR, 'en.json');

function label(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value; // 'boolean' | 'number' | 'string' | 'object'
}

/**
 * Recursively compare two already-parsed JSON values rooted at `prefix`.
 * Descends into child nodes instead of re-reading files, so recursion always terminates.
 * @returns array of human-readable problems ([] = clean)
 */
function check(file, aNode, bNode, prefix = '') {
  const problems = [];
  const ak = Object.keys(aNode).sort();
  const bk = Object.keys(bNode).sort();
  for (const k of ak) if (!bk.includes(k)) problems.push(`${prefix}${k} is missing`);
  for (const k of bk) if (!ak.includes(k)) problems.push(`${prefix}${k} is extra (not present in en.json)`);

  for (const k of ak) {
    const ea = aNode[k];
    const eb = bNode[k];
    const bothObjects = typeof ea === 'object' && ea !== null && typeof eb === 'object' && eb !== null;
    if (bothObjects) problems.push(...check(file, ea, eb, `${prefix}${k}.`)); // descend into this subtree only
    else {
      if (label(ea) !== label(eb)) problems.push(`type mismatch at ${prefix}${k}: expected ${label(eb)}, got ${label(ea)}`);
      if (file.endsWith('template.json') && eb !== '') problems.push(`${prefix}${k} template.json leaf must be an empty string, got ${JSON.stringify(eb)}`);
    }
  }
  return problems;
}

/** Parse and validate one locale file against the baseline. */
function validate(file, base) {
  let a, b;
  try { a = JSON.parse(readFileSync(base, 'utf8')); } catch (e) { return [`Cannot parse baseline ${base}: ${e.message}`]; }
  try { b = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return [`Cannot parse ${file}: ${e.message}`]; }

  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return [`${file} both files must be JSON objects at the root`];
  }

  // Parse once per file, then descend into child nodes — never re-read from disk inside recursion.
  return check(file, a, b);
}

/** Recursively collect all *.json files under a directory. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full);
  }
  return out.sort();
}

console.error('DEBUG BASELINE path=' + BASELINE);
console.error('DEBUG parsed chat.placeholder=' + JSON.stringify(JSON.parse(readFileSync(BASELINE,'utf8')).chat.placeholder));
const files = walk(LOCALES_DIR).filter((f) => f !== BASELINE);
if (files.length === 0) {
  console.error(`No locale files found in ${LOCALES_DIR}`);
  process.exit(1);
}

let failed = false;
for (const file of files) {
  const problems = validate(file, BASELINE);
  if (problems.length === 0) {
    console.log(`PASS ${file.replace(LOCALES_DIR + '/', '')}`);
  } else {
    failed = true;
    console.log(`FAIL ${file.replace(LOCALES_DIR + '/', '')}:`);
    for (const p of problems) console.log(`   - ${p}`);
  }
}

console.log(failed ? '\nRESULT: locale validation FAILED' : '\nRESULT: all locales valid');
process.exit(failed ? 1 : 0);
