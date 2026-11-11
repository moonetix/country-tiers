import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const rows = JSON.parse(read('data/countries.json'));
const schema = JSON.parse(read('data/countries.schema.json'));
const source = JSON.parse(read('sources/tiers.json'));
const memberships = JSON.parse(read('sources/memberships.json'));

// Covers the subset of JSON Schema that countries.schema.json uses.
function validate(value, s, path = '$') {
  const errors = [];
  const types = s.type ? [].concat(s.type) : null;
  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : Number.isInteger(v) ? 'integer' : typeof v);
  if (types && !types.some((t) => t === typeOf(value) || (t === 'number' && typeof value === 'number'))) {
    return [`${path}: expected ${types.join('|')}, got ${typeOf(value)}`];
  }
  if (s.enum && !s.enum.some((e) => e === value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (typeof value === 'string') {
    if (s.pattern && !new RegExp(s.pattern).test(value)) errors.push(`${path}: does not match ${s.pattern}`);
    if (s.minLength && value.length < s.minLength) errors.push(`${path}: too short`);
  }
  if (Array.isArray(value)) {
    if (s.minItems && value.length < s.minItems) errors.push(`${path}: fewer than ${s.minItems} items`);
    if (s.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push(`${path}: duplicate items`);
    if (s.items) value.forEach((v, i) => errors.push(...validate(v, s.items, `${path}[${i}]`)));
  }
  if (typeOf(value) === 'object') {
    for (const key of s.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      if (s.properties?.[key]) errors.push(...validate(v, s.properties[key], `${path}.${key}`));
      else if (s.additionalProperties === false) errors.push(`${path}: unexpected ${key}`);
    }
  }
  return errors;
}

test('countries.json matches countries.schema.json', () => {
  assert.deepEqual(validate(rows, schema), []);
});

test('codes are unique and sorted', () => {
  const iso2 = rows.map((r) => r.iso2);
  assert.deepEqual(iso2, [...iso2].sort());
  assert.equal(new Set(iso2).size, rows.length);
  assert.equal(new Set(rows.map((r) => r.iso3)).size, rows.length);
});

test('tier files match countries.json', () => {
  for (const tier of [1, 2, 3]) {
    const fromTxt = read(`data/tier${tier}.txt`).trim().split('\n');
    assert.deepEqual(fromTxt, rows.filter((r) => r.tier === tier).map((r) => r.iso2));
  }
});

test('countries.csv matches countries.json', () => {
  const lines = read('data/countries.csv').trim().split('\n');
  const header = lines[0].split(',');
  assert.deepEqual(header, Object.keys(rows[0]));
  assert.equal(lines.length - 1, rows.length);
  const us = lines.find((l) => l.startsWith('US,'));
  assert.ok(us.includes(',1,named,,High income,HIC,'));
});

test('every country the reference article names keeps its tier', () => {
  for (const tier of [1, 2, 3]) {
    for (const code of source[`tier${tier}`].named) {
      const row = rows.find((r) => r.iso2 === code);
      assert.equal(row.tier, tier, code);
      assert.equal(row.tier_basis, 'named', code);
    }
  }
});

test('data/ reflects sources/tiers.json', () => {
  const listed = new Map();
  for (const tier of [1, 2, 3]) {
    for (const [basis, codes] of Object.entries(source[`tier${tier}`])) {
      for (const code of codes) listed.set(code, { tier, basis });
    }
  }
  for (const r of rows) {
    const want = listed.get(r.iso2) ?? { tier: 3, basis: 'rule' };
    assert.equal(r.tier, want.tier, r.iso2);
    assert.equal(r.tier_basis, want.basis, r.iso2);
    assert.deepEqual(r.alt_tiers, source.alternates[r.iso2] ?? [], r.iso2);
  }
});

test('EU and EEA counts', () => {
  assert.equal(rows.filter((r) => r.eu_member).length, 27);
  assert.equal(rows.filter((r) => r.eea_member).length, 30);
  assert.deepEqual(rows.filter((r) => r.eu_member).map((r) => r.iso2), [...memberships.eu_members.codes].sort());
  for (const r of rows) {
    if (r.eu_member) assert.ok(r.eu_territory && r.eea_member, r.iso2);
  }
});
