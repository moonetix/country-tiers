#!/usr/bin/env node
// Rebuilds everything in data/ from the upstream sources in sources/upstream.json
// and the editorial tier list in sources/tiers.json.
//
//   node scripts/build.mjs            fetch upstream, write data/ if anything changed
//   node scripts/build.mjs --offline  reuse the responses cached in .cache/
//   node scripts/build.mjs --check    exit 1 if data/ is out of date, write nothing

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const offline = args.has('--offline');
const checkOnly = args.has('--check');

const readJson = async (rel) => JSON.parse(await readFile(join(root, rel), 'utf8'));
const upstream = await readJson('sources/upstream.json');
const tiers = await readJson('sources/tiers.json');
const memberships = await readJson('sources/memberships.json');

const warnings = [];
const fail = (msg) => {
  console.error(`error: ${msg}`);
  process.exit(1);
};

async function fetchText(url, cacheName) {
  const cachePath = join(root, '.cache', cacheName);
  if (offline) {
    if (!existsSync(cachePath)) fail(`--offline but ${cachePath} is missing; run once without it`);
    return readFile(cachePath, 'utf8');
  }
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'country-tiers-build (+https://github.com/moonetix/country-tiers)' },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await mkdir(dirname(cachePath), { recursive: true });
      await writeFile(cachePath, text);
      return text;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
  fail(`could not fetch ${url}: ${lastError.message}`);
}

// ISO 3166-1 from Debian iso-codes, pinned to a release tag.
const isoUrl = upstream.iso_codes.url.replace('{version}', upstream.iso_codes.version);
const isoList = JSON.parse(await fetchText(isoUrl, 'iso_3166-1.json'))['3166-1'];
if (!Array.isArray(isoList) || isoList.length < 240) fail('iso-codes data looks truncated');

if (!offline) {
  try {
    const tags = JSON.parse(await fetchText(upstream.iso_codes.tags_api, 'iso-codes-tags.json'));
    const latest = tags[0]?.name;
    if (latest && latest !== upstream.iso_codes.version) {
      warnings.push(`iso-codes ${latest} is out (pinned ${upstream.iso_codes.version}); review its changelog and bump sources/upstream.json`);
    }
  } catch {
    warnings.push('could not check for a newer iso-codes release');
  }
}

// World Bank: income group and region. Aggregates (region id "NA") are not countries.
const wbBody = JSON.parse(await fetchText(upstream.world_bank.url, 'worldbank.json'));
const wbRows = (wbBody[1] ?? []).filter((r) => r.region?.id && r.region.id !== 'NA');
if (wbRows.length < 200) fail(`World Bank API returned ${wbRows.length} economies, expected over 200`);
const wb = new Map(wbRows.map((r) => [r.iso2Code, r]));

// EU membership as listed on europa.eu. The page is HTML, so a parse that finds
// nothing is a warning (layout change); a parse that finds a different list stops the build.
const euSlugs = new Set();
for (let page = 0; page < upstream.eu.pages; page++) {
  const url = page === 0 ? upstream.eu.url : `${upstream.eu.url}?page=${page}`;
  const html = await fetchText(url, `eu-countries-${page}.html`);
  for (const m of html.matchAll(/\/principles-countries-history\/eu-countries\/([a-z-]+)_en"/g)) euSlugs.add(m[1]);
}
const expectedSlugs = new Set(Object.keys(memberships.eu_members.page_slugs));
if (euSlugs.size === 0) {
  warnings.push('could not read the EU member list from europa.eu; EU flags were not re-verified');
} else {
  const added = [...euSlugs].filter((s) => !expectedSlugs.has(s));
  const removed = [...expectedSlugs].filter((s) => !euSlugs.has(s));
  if (added.length || removed.length) {
    fail(`europa.eu EU member list changed (added: ${added.join(', ') || 'none'}; removed: ${removed.join(', ') || 'none'}). Update sources/memberships.json.`);
  }
}

// Countries: every ISO 3166-1 entry plus the extra codes ad platforms use (Kosovo).
const countries = new Map();
for (const c of isoList) {
  countries.set(c.alpha_2, {
    iso2: c.alpha_2,
    iso3: c.alpha_3,
    numeric: c.numeric,
    name: c.name,
    common_name: c.common_name ?? c.name,
    iso_status: 'official',
  });
}
for (const [code, extra] of Object.entries(tiers.extra_codes)) {
  countries.set(code, { iso2: code, iso3: extra.iso3, numeric: null, name: extra.name, common_name: extra.common_name, iso_status: extra.iso_status });
}

const assigned = new Map();
for (const tier of [1, 2, 3]) {
  const group = tiers[`tier${tier}`];
  for (const [basis, codes] of Object.entries(group)) {
    for (const code of codes) {
      if (!countries.has(code)) fail(`sources/tiers.json: unknown code ${code} in tier${tier}.${basis}`);
      if (assigned.has(code)) fail(`sources/tiers.json: ${code} appears twice`);
      assigned.set(code, { tier, basis });
    }
  }
}
for (const [code, alts] of Object.entries(tiers.alternates)) {
  if (!assigned.has(code)) fail(`sources/tiers.json: alternate for ${code}, which has no explicit tier`);
  for (const t of alts) if (![1, 2, 3].includes(t) || t === assigned.get(code).tier) fail(`sources/tiers.json: bad alternate tier for ${code}`);
}

const euMembers = new Set(memberships.eu_members.codes);
const euTerritories = new Set([
  ...euMembers,
  ...memberships.eu_territories.outermost_regions.codes,
  ...memberships.eu_territories.aland.codes,
]);
const eea = new Set([...euMembers, ...memberships.eea_non_eu.codes]);
for (const code of [...euTerritories, ...eea]) if (!countries.has(code)) fail(`sources/memberships.json: unknown code ${code}`);
if (euMembers.size !== Object.keys(memberships.eu_members.page_slugs).length) fail('sources/memberships.json: codes and page_slugs disagree');

const rows = [...countries.values()]
  .sort((a, b) => a.iso2.localeCompare(b.iso2))
  .map((c) => {
    const placed = assigned.get(c.iso2) ?? { tier: 3, basis: 'rule' };
    const w = wb.get(tiers.world_bank_aliases[c.iso2] ?? c.iso2);
    const incomeCode = w?.incomeLevel?.id || null;
    const isIncome = ['HIC', 'UMC', 'LMC', 'LIC'].includes(incomeCode);

    // The rule only places countries the article does not name. Flag drift for a human to review.
    if (placed.basis === 'rule') {
      const high = incomeCode === 'HIC';
      if (placed.tier === 2 && !high) warnings.push(`${c.iso2} is Tier 2 by the income rule but the World Bank now lists it as ${w?.incomeLevel?.value ?? 'unclassified'}`);
      if (placed.tier === 3 && high) warnings.push(`${c.iso2} is Tier 3 by the income rule but the World Bank now lists it as High income`);
    }

    return {
      iso2: c.iso2,
      iso3: c.iso3,
      numeric: c.numeric,
      name: c.name,
      common_name: c.common_name,
      iso_status: c.iso_status,
      tier: placed.tier,
      tier_basis: placed.basis,
      alt_tiers: tiers.alternates[c.iso2] ?? [],
      income_group: isIncome ? w.incomeLevel.value.trim() : null,
      income_code: isIncome ? incomeCode : null,
      region: w ? w.region.value.trim() : null,
      region_code: w ? w.region.id : null,
      eu_member: euMembers.has(c.iso2),
      eu_territory: euTerritories.has(c.iso2),
      eea_member: eea.has(c.iso2),
    };
  });

for (const code of wb.keys()) {
  const mapped = Object.values(tiers.world_bank_aliases).includes(code);
  if (!countries.has(code) && !mapped) warnings.push(`World Bank economy ${code} has no matching code here`);
}

// Serializers. One country per line keeps git diffs readable.
const jsonOut = '[\n' + rows.map((r) => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n';

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) v = v.join('|');
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const columns = Object.keys(rows[0]);
const csvOut = [columns.join(','), ...rows.map((r) => columns.map((k) => csvCell(r[k])).join(','))].join('\n') + '\n';

const outputs = {
  'data/countries.json': jsonOut,
  'data/countries.csv': csvOut,
};
for (const tier of [1, 2, 3]) {
  outputs[`data/tier${tier}.txt`] = rows.filter((r) => r.tier === tier).map((r) => r.iso2).join('\n') + '\n';
}

const changed = [];
for (const [rel, content] of Object.entries(outputs)) {
  const path = join(root, rel);
  const current = existsSync(path) ? await readFile(path, 'utf8') : null;
  if (current !== content) changed.push(rel);
}

for (const w of warnings) console.warn(`warning: ${w}`);

const counts = Object.fromEntries([1, 2, 3].map((t) => [`tier${t}`, rows.filter((r) => r.tier === t).length]));
console.log(`${rows.length} countries: ${counts.tier1} in Tier 1, ${counts.tier2} in Tier 2, ${counts.tier3} in Tier 3`);

if (checkOnly) {
  if (changed.length) {
    console.log(`out of date: ${changed.join(', ')}`);
    process.exit(1);
  }
  console.log('data/ is up to date');
  process.exit(0);
}

if (!changed.length) {
  console.log('no changes');
  process.exit(0);
}

const meta = {
  updated: new Date().toISOString().slice(0, 10),
  countries: rows.length,
  ...counts,
  sources: [
    { name: upstream.iso_codes.name, version: upstream.iso_codes.version, url: isoUrl, license: upstream.iso_codes.license, license_url: upstream.iso_codes.license_url, fields: ['iso2', 'iso3', 'numeric', 'name', 'common_name'] },
    { name: upstream.world_bank.name, url: upstream.world_bank.url, license: upstream.world_bank.license, license_url: upstream.world_bank.license_url, fields: ['income_group', 'income_code', 'region', 'region_code'] },
    { name: upstream.eu.name, url: upstream.eu.url, license: upstream.eu.license, license_url: upstream.eu.license_url, fields: ['eu_member'] },
    { name: 'Eurostat glossary, European Economic Area', url: memberships.eea_non_eu.source, license: upstream.eu.license, license_url: upstream.eu.license_url, fields: ['eea_member'] },
    { name: 'European Commission, outermost regions', url: memberships.eu_territories.outermost_regions.source, license: upstream.eu.license, license_url: upstream.eu.license_url, fields: ['eu_territory'] },
    { name: 'Treaty on the Functioning of the European Union, Article 355(4)', url: memberships.eu_territories.aland.source, fields: ['eu_territory'] },
    { name: 'Moonetix Academy, Tier 1, 2 and 3 countries', url: tiers.reference, fields: ['tier', 'tier_basis', 'alt_tiers'] },
  ],
};
outputs['data/sources.json'] = JSON.stringify(meta, null, 2) + '\n';

await mkdir(join(root, 'data'), { recursive: true });
for (const [rel, content] of Object.entries(outputs)) await writeFile(join(root, rel), content);
console.log(`updated: ${changed.join(', ')}`);
