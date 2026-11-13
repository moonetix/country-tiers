#!/usr/bin/env node
// Assembles the GitHub Pages demo in _site/ from site/, js/ and data/, and adds
// one flag per country from the flag-icons npm package (MIT).
// Node 22 built-ins only. Run: node scripts/build-site.mjs
//
// The flags are not kept in this repo. The build downloads one pinned tarball,
// checks it against the sha512 below and unpacks only flags/4x3/<iso2>.svg for
// the codes in data/countries.json. To build offline, set FLAGS_TARBALL to a
// local copy of the same tarball; it goes through the same integrity check.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// To update: copy dist.tarball and dist.integrity from
// https://registry.npmjs.org/flag-icons/latest and change all three together.
export const FLAGS = {
  version: '7.6.0',
  tarball: 'https://registry.npmjs.org/flag-icons/-/flag-icons-7.6.0.tgz',
  integrity: 'sha512-hir/PsXwr0EESyizKrXJzmkzpLIMf+1vlNKLqAfvdh+bsU94a7LYWTiubkHKqptGoCPzOUGcm6c4PfC9/BaGSQ==',
};

// A country without a flag stops the build. The one way around it is to list
// the lowercase code here, which ships the neutral placeholder below for it.
// Empty today: flag-icons 7.6.0 has all 250 codes, XK included.
export const NO_FLAG = new Set([]);
const PLACEHOLDER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#d9e0dc" d="M0 0h640v480H0z"/><path fill="none" stroke="#4a5550" stroke-width="24" d="M12 12h616v456H12z"/></svg>\n';

export function checkIntegrity(buf, integrity) {
  const actual = `sha512-${createHash('sha512').update(buf).digest('base64')}`;
  if (actual !== integrity) {
    throw new Error(`flag-icons tarball failed the integrity check: expected ${integrity}, got ${actual}`);
  }
}

function paxPath(data) {
  let pos = 0;
  while (pos < data.length) {
    const space = data.indexOf(0x20, pos);
    const length = Number(data.toString('latin1', pos, space));
    if (space < 0 || !(length > 0)) throw new Error('tar: malformed pax header');
    const record = data.toString('utf8', space + 1, pos + length - 1);
    if (record.startsWith('path=')) return record.slice(5);
    pos += length;
  }
  return null;
}

// Reads the tar that npm publishes: ustar headers with the optional prefix
// field, and pax "path" records for names longer than the header allows.
// Yields regular files only.
export function* tarEntries(buf) {
  let offset = 0;
  let longName = null;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) return;
    const field = (start, length) => {
      const raw = header.subarray(start, start + length);
      const end = raw.indexOf(0);
      return raw.toString('utf8', 0, end < 0 ? length : end);
    };
    let sum = 8 * 0x20;
    for (let i = 0; i < 512; i++) if (i < 148 || i >= 156) sum += header[i];
    if (sum !== parseInt(field(148, 8), 8)) throw new Error(`tar: bad header checksum at byte ${offset}`);
    const size = parseInt(field(124, 12), 8);
    if (!Number.isInteger(size)) throw new Error(`tar: bad size at byte ${offset}`);
    const data = buf.subarray(offset + 512, offset + 512 + size);
    if (data.length !== size) throw new Error('tar: archive is truncated');
    offset += 512 + Math.ceil(size / 512) * 512;

    const type = field(156, 1) || '0';
    if (type === 'x') {
      longName = paxPath(data);
      continue;
    }
    if (type === 'g') continue;
    const prefix = field(257, 6) === 'ustar' ? field(345, 155) : '';
    const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longName = null;
    if (type === '0') yield { name, data };
  }
  throw new Error('tar: end of archive marker is missing');
}

// Returns Map<lowercase iso2, svg bytes> for exactly the given codes, plus the
// package license text. Throws on a failed integrity check or a missing flag.
export function flagsFromTarball(tarball, codes, { integrity = FLAGS.integrity, noFlag = NO_FLAG } = {}) {
  checkIntegrity(tarball, integrity);
  const wanted = new Set(codes.map((code) => code.toLowerCase()));
  const found = new Map();
  let license = null;
  for (const { name, data } of tarEntries(gunzipSync(tarball))) {
    const flag = /^package\/flags\/4x3\/([a-z]{2})\.svg$/.exec(name);
    if (flag && wanted.has(flag[1])) found.set(flag[1], data);
    else if (name === 'package/LICENSE') license = data;
  }
  const missing = [...wanted].filter((code) => !found.has(code) && !noFlag.has(code)).sort();
  if (missing.length) {
    throw new Error(
      `flag-icons has no 4x3 flag for ${missing.join(', ').toUpperCase()}. `
      + 'Pin a release that has it, or add the code to NO_FLAG in scripts/build-site.mjs to ship a placeholder.',
    );
  }
  if (!license) throw new Error('flag-icons tarball has no LICENSE file');
  const flags = new Map([...wanted].sort().map((code) => [code, found.get(code) ?? Buffer.from(PLACEHOLDER)]));
  return { flags, license };
}

async function loadTarball() {
  const local = process.env.FLAGS_TARBALL;
  if (local) return readFileSync(local);
  let failure;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(FLAGS.tarball, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      failure = err;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
  }
  throw new Error(`could not download ${FLAGS.tarball} (${failure.message}). Set FLAGS_TARBALL to a local copy to build offline.`);
}

async function main() {
  const out = join(root, '_site');
  const countries = JSON.parse(readFileSync(join(root, 'data', 'countries.json'), 'utf8'));
  const { flags, license } = flagsFromTarball(await loadTarball(), countries.map((row) => row.iso2));

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'js'), { recursive: true });
  mkdirSync(join(out, 'data'), { recursive: true });
  mkdirSync(join(out, 'flags'), { recursive: true });

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

  let flagBytes = 0;
  for (const [code, svg] of flags) {
    writeFileSync(join(out, 'flags', `${code}.svg`), svg);
    flagBytes += svg.length;
  }
  writeFileSync(join(out, 'flags', 'LICENSE.txt'), license);

  const sources = JSON.parse(readFileSync(join(root, 'data', 'sources.json'), 'utf8'));
  console.log(
    `Built _site/ (${sources.countries} countries, data updated ${sources.updated}, `
    + `${flags.size} flags from flag-icons ${FLAGS.version}, ${flagBytes} bytes)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`error: ${err.message}`);
    process.exit(1);
  });
}
