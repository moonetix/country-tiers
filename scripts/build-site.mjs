#!/usr/bin/env node
// Assembles the GitHub Pages demo in _site/ from site/, js/ and data/.
// Node 22 built-ins only. Run: node scripts/build-site.mjs
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '_site');

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'js'), { recursive: true });
mkdirSync(join(out, 'data'), { recursive: true });

cpSync(join(root, 'site'), out, { recursive: true });

// The library reads its data with a JSON import attribute. Browsers without
// JSON module support would fail on that line, so the page gets the same
// module with that one import swapped for a fetch of the same file.
const IMPORT_LINE = "import rows from '../data/countries.json' with { type: 'json' };";
const lib = readFileSync(join(root, 'js', 'index.js'), 'utf8');
if (!lib.includes(IMPORT_LINE)) {
  throw new Error('js/index.js no longer starts with the expected JSON import; update scripts/build-site.mjs');
}
const browserLib = lib.replace(
  IMPORT_LINE,
  "const rows = await (await fetch(new URL('../data/countries.json', import.meta.url))).json();",
);
writeFileSync(join(out, 'js', 'index.js'), browserLib);

const DATA_FILES = [
  'countries.json',
  'countries.csv',
  'countries.schema.json',
  'sources.json',
  'tier1.txt',
  'tier2.txt',
  'tier3.txt',
];
for (const file of DATA_FILES) cpSync(join(root, 'data', file), join(out, 'data', file));

const sources = JSON.parse(readFileSync(join(root, 'data', 'sources.json'), 'utf8'));
console.log(`Built _site/ (${sources.countries} countries, data updated ${sources.updated})`);
