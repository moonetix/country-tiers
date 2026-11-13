import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { checkIntegrity, tarEntries, flagsFromTarball } from '../scripts/build-site.mjs';

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
