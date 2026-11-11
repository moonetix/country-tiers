import rows from '../data/countries.json' with { type: 'json' };

const byIso2 = new Map(rows.map((r) => [r.iso2, r]));
const byIso3 = new Map(rows.map((r) => [r.iso3, r]));
const TIERS = [1, 2, 3];
const FORMATS = ['iso2', 'iso3', 'numeric'];

export const countries = rows;

export function lookup(code) {
  if (typeof code !== 'string') return null;
  let c = code.trim().toUpperCase();
  if (c === 'UK') c = 'GB';
  if (c.length === 2) return byIso2.get(c) ?? null;
  if (c.length === 3) return byIso3.get(c) ?? null;
  return null;
}

export function tierOf(code) {
  return lookup(code)?.tier ?? null;
}

function checkTier(tier) {
  if (!TIERS.includes(tier)) throw new RangeError(`tier must be 1, 2 or 3, got ${JSON.stringify(tier)}`);
  return tier;
}

export function countriesInTier(tier) {
  checkTier(tier);
  return rows.filter((r) => r.tier === tier).map((r) => r.iso2);
}

export function isEU(code, { territories = false } = {}) {
  const row = lookup(code);
  if (!row) return false;
  return territories ? row.eu_territory : row.eu_member;
}

export function isEEA(code) {
  return lookup(code)?.eea_member ?? false;
}

export function incomeGroup(code) {
  return lookup(code)?.income_group ?? null;
}

function resolveAll(codes, label) {
  return codes.map((code) => {
    const row = lookup(code);
    if (!row) throw new RangeError(`unknown country code in ${label}: ${JSON.stringify(code)}`);
    return row.iso2;
  });
}

export function geoTargets(tiers, { exclude = [], include = [], alternates = false, format = 'iso2' } = {}) {
  const wanted = (Array.isArray(tiers) ? tiers : [tiers]).map(checkTier);
  if (!FORMATS.includes(format)) throw new RangeError(`format must be one of ${FORMATS.join(', ')}`);
  const excluded = new Set(resolveAll(exclude, 'exclude'));
  const picked = new Set(resolveAll(include, 'include'));

  for (const r of rows) {
    const inTier = wanted.includes(r.tier) || (alternates && r.alt_tiers.some((t) => wanted.includes(t)));
    if (inTier) picked.add(r.iso2);
  }
  for (const code of excluded) picked.delete(code);

  return [...picked]
    .map((code) => byIso2.get(code)[format])
    .filter((v) => v !== null)
    .sort();
}
