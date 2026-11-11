import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as tiers from '../js/index.js';

const { cases } = JSON.parse(readFileSync(new URL('./vectors.json', import.meta.url), 'utf8'));

for (const c of cases) {
  test(`${c.fn}(${c.args.map((a) => JSON.stringify(a)).join(', ')})`, () => {
    const call = () => tiers[c.fn](...c.args);
    if (c.error) {
      assert.throws(call, RangeError);
    } else {
      assert.deepEqual(call(), c.expect);
    }
  });
}

test('countriesInTier returns a fresh array each call', () => {
  const a = tiers.countriesInTier(1);
  a.push('ZZ');
  assert.equal(tiers.countriesInTier(1).includes('ZZ'), false);
});
