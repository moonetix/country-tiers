import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { checkIntegrity, tarEntries, flagsFromTarball, pageHtml } from '../scripts/build-site.mjs';

// One ustar entry: 512-byte header, then the data padded to a multiple of 512.
function entry(name, content, { type = '0', prefix = '' } = {}) {
  const data = Buffer.from(content);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100);
  header.write('0000644\0', 100);
  header.write(data.length.toString(8).padStart(11, '0') + '\0', 124);
  header.write(' '.repeat(8), 148);
  header.write(type, 156);
  header.write('ustar\0' + '00', 257);
  header.write(prefix, 345, 155);
  header.write(header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0') + '\0 ', 148);
  return Buffer.concat([header, data, Buffer.alloc((512 - (data.length % 512)) % 512)]);
}
const tar = (...entries) => Buffer.concat([...entries, Buffer.alloc(1024)]);
const sha512 = (buf) => `sha512-${createHash('sha512').update(buf).digest('base64')}`;

const SVG = { de: '<svg id="de"/>', xk: '<svg id="xk"/>' };
// A pax record is "<length> <key>=<value>\n", where the length counts itself.
const pax = '33 path=package/flags/4x3/xk.svg\n';
const archive = gzipSync(tar(
  entry('package/LICENSE', 'The MIT License (MIT)'),
  entry('package/flags/1x1/de.svg', '<svg id="square"/>'),
  entry('de.svg', SVG.de, { prefix: 'package/flags/4x3' }),
  entry('PaxHeader/xk.svg', pax, { type: 'x' }),
  entry('truncated-name', SVG.xk),
  entry('package/flags/4x3/gb-eng.svg', '<svg id="gb-eng"/>'),
));

test('tar reader yields regular files with prefix and pax names', () => {
  assert.equal(Buffer.byteLength(pax), 33);
  const names = [...tarEntries(tar(
    entry('a.txt', 'A'),
    entry('dir/', '', { type: '5' }),
    entry('b.txt', 'B'.repeat(600), { prefix: 'deep/er' }),
  ))].map((e) => [e.name, e.data.length]);
  assert.deepEqual(names, [['a.txt', 1], ['deep/er/b.txt', 600]]);
});

test('tar reader rejects a corrupt header and a missing end marker', () => {
  const broken = tar(entry('a.txt', 'A'));
  broken[3] ^= 1;
  assert.throws(() => [...tarEntries(broken)], /bad header checksum/);
  assert.throws(() => [...tarEntries(entry('a.txt', 'A'))], /end of archive/);
});

test('integrity check compares the sha512 of the tarball', () => {
  checkIntegrity(archive, sha512(archive));
  assert.throws(() => checkIntegrity(Buffer.concat([archive, Buffer.from([0])]), sha512(archive)), /integrity check/);
});

test('flags are taken from flags/4x3 for the requested codes only', () => {
  const { flags, license } = flagsFromTarball(archive, ['XK', 'DE'], { integrity: sha512(archive) });
  assert.deepEqual([...flags.keys()], ['de', 'xk']);
  assert.equal(flags.get('de').toString(), SVG.de);
  assert.equal(flags.get('xk').toString(), SVG.xk);
  assert.equal(license.toString(), 'The MIT License (MIT)');
});

test('a wrong hash or a country without a flag stops the build', () => {
  assert.throws(() => flagsFromTarball(archive, ['DE']), /integrity check/);
  assert.throws(() => flagsFromTarball(archive, ['DE', 'ZZ', 'AA'], { integrity: sha512(archive) }), /no 4x3 flag for AA, ZZ/);
});

test('a code listed as having no flag gets the placeholder', () => {
  const { flags } = flagsFromTarball(archive, ['DE', 'ZZ'], { integrity: sha512(archive), noFlag: new Set(['zz']) });
  assert.match(flags.get('zz').toString(), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 640 480">/);
  assert.equal(flags.get('de').toString(), SVG.de);
});

const countriesJson = JSON.parse(readFileSync(new URL('../data/countries.json', import.meta.url), 'utf8'));
const sourcesJson = JSON.parse(readFileSync(new URL('../data/sources.json', import.meta.url), 'utf8'));
const pageTemplate = readFileSync(new URL('../site/index.html', import.meta.url), 'utf8');

test('the page header is filled from the data files', () => {
  const html = pageHtml(pageTemplate, countriesJson, sourcesJson, { commit: '', now: new Date('2026-01-02T03:04:05Z') });
  assert.doesNotMatch(html, /\{\{[A-Z0-9_]+\}\}/);
  const tiers = [1, 2, 3].map((t) => countriesJson.filter((row) => row.tier === t).length);
  assert.ok(html.includes(`Tier 1: ${tiers[0]}, Tier 2: ${tiers[1]}, Tier 3: ${tiers[2]}`));
  assert.ok(html.includes(`<dd>${countriesJson.length}, `));
  assert.ok(html.includes(`<dd>${sourcesJson.updated}, checked weekly</dd>`));
  assert.ok(html.includes('<dd>2026-01-02, Node '));
  assert.ok(html.includes('<dd>local build</dd>'));
  const linked = pageHtml(pageTemplate, countriesJson, sourcesJson, { commit: 'abc1234' });
  assert.ok(linked.includes('href="https://github.com/moonetix/country-tiers/commit/abc1234">abc1234</a>'));
});

test('a missing or unknown header value stops the build', () => {
  assert.throws(() => pageHtml(`${pageTemplate}{{NOPE}}`, countriesJson, sourcesJson), /unknown placeholders \{\{NOPE\}\}/);
  assert.throws(() => pageHtml(pageTemplate, countriesJson, { ...sourcesJson, updated: '' }), /no value for \{\{DATA_DATE\}\}/);
  assert.throws(() => pageHtml(pageTemplate, countriesJson.slice(1), sourcesJson), /countries\.json has/);
});
