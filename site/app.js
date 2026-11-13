const lib = await import('./js/index.js').catch(() => null);
const { countries, lookup, countriesInTier, isEU, isEEA, incomeGroup, geoTargets } = lib ?? {};

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids) node.append(kid);
  return node;
};

const REGION_ORDER = [
  'North America',
  'Latin America & Caribbean',
  'Europe & Central Asia',
  'Middle East, North Africa, Afghanistan & Pakistan',
  'Sub-Saharan Africa',
  'South Asia',
  'East Asia & Pacific',
  null,
];
const REGION_LABEL = (r) => r ?? 'No World Bank region';
const byName = (a, b) => a.common_name.localeCompare(b.common_name, 'en');
const flagUrl = (r) => `flags/${r.iso2.toLowerCase()}.svg`;
const flag = (r, width, height, cls) => el('img', {
  class: cls,
  loading: 'lazy',
  decoding: 'async',
  width: String(width),
  height: String(height),
  alt: '',
  src: flagUrl(r),
});
const NEAR = 400;
const nearView = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    for (const entry of entries) if (entry.isIntersecting) showFlag(entry.target);
  }, { rootMargin: `${NEAR}px 0px` })
  : null;
function showFlag(img) {
  img.src = img.dataset.src;
  nearView?.unobserve(img);
}
function tileFlag(r) {
  const img = el('img', { loading: 'lazy', decoding: 'async', width: '24', height: '18', alt: '' });
  img.dataset.src = flagUrl(r);
  return img;
}
function startTileFlags() {
  for (const img of document.querySelectorAll('#map img')) {
    const box = img.getBoundingClientRect();
    const near = box.width > 0 && box.top < window.innerHeight + NEAR && box.bottom > -NEAR;
    if (near || !nearView) showFlag(img);
    else nearView.observe(img);
  }
}

const state = { q: '', tier: '', income: '', group: '', view: 'map', selected: 'US', sortKey: 'tier', sortDir: 1 };

function parseHash() {
  const code = decodeURIComponent(location.hash.slice(1));
  const row = code ? lookup(code) : null;
  if (row) state.selected = row.iso2;
}

function matches(r) {
  if (state.tier && r.tier !== Number(state.tier)) return false;
  if (state.income) {
    if (state.income === 'none' ? r.income_code !== null : r.income_code !== state.income) return false;
  }
  if (state.group === 'eu' && !isEU(r.iso2)) return false;
  if (state.group === 'eu_territory' && !isEU(r.iso2, { territories: true })) return false;
  if (state.group === 'eea' && !isEEA(r.iso2)) return false;
  if (state.group === 'alt' && r.alt_tiers.length === 0) return false;
  const q = state.q.trim().toLowerCase();
  if (q) {
    const exact = lookup(q);
    if (exact) return exact.iso2 === r.iso2;
    const hay = [r.common_name, r.name, r.iso2, r.iso3, r.numeric ?? ''].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function renderStats() {
  const list = $('#stats');
  const items = [
    `${countries.length} countries`,
    ...[1, 2, 3].map((t) => `Tier ${t}: ${countriesInTier(t).length}`),
  ];
  for (const text of items) list.append(el('li', { class: 'chip', text }));
}

function tierWord(r) {
  return `Tier ${r.tier}`;
}

function renderMap() {
  const host = $('#map');
  host.textContent = '';
  const groups = new Map(REGION_ORDER.map((r) => [r, []]));
  for (const r of countries) {
    if (!groups.has(r.region)) groups.set(r.region, []);
    groups.get(r.region).push(r);
  }
  for (const [region, rows] of groups) {
    if (!rows.length) continue;
    rows.sort((a, b) => a.tier - b.tier || byName(a, b));
    const counts = [1, 2, 3].map((t) => rows.filter((r) => r.tier === t).length);
    const id = `region-${REGION_ORDER.indexOf(region)}`;
    const block = el('section', { class: 'region', 'aria-labelledby': id });
    block.append(
      el('h3', { id },
        el('span', { text: REGION_LABEL(region) }),
        el('span', { class: 'muted small', text: ` ${rows.length} countries, ${counts.map((c, i) => `T${i + 1} ${c}`).join(', ')}` }),
      ),
    );
    const grid = el('div', { class: 'tiles' });
    for (const r of rows) {
      grid.append(
        el('button', {
          type: 'button',
          class: `tile t${r.tier}`,
          'data-iso2': r.iso2,
          title: r.common_name,
          'aria-label': `${r.common_name}, ${tierWord(r)}`,
          tabindex: '-1',
        },
        tileFlag(r),
        el('span', { class: 'tl' }, el('b', { text: r.iso2 }), el('span', { class: 'tn', text: String(r.tier) }))),
      );
    }
    block.append(grid);
    host.append(block);
  }
  host.addEventListener('click', (e) => {
    const tile = e.target.closest('.tile');
    if (tile) select(tile.dataset.iso2, true);
  });
  host.addEventListener('keydown', onTileKey);
}

function visibleTiles() {
  return [...document.querySelectorAll('#map .tile')];
}

function onTileKey(e) {
  const tiles = visibleTiles();
  const i = tiles.indexOf(document.activeElement);
  if (i < 0) return;
  let next;
  if (e.key === 'ArrowRight') next = tiles[i + 1];
  else if (e.key === 'ArrowLeft') next = tiles[i - 1];
  else if (e.key === 'Home') next = tiles[0];
  else if (e.key === 'End') next = tiles[tiles.length - 1];
  else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const down = e.key === 'ArrowDown';
    const cur = tiles[i].getBoundingClientRect();
    const rows = tiles
      .map((t) => ({ t, r: t.getBoundingClientRect() }))
      .filter(({ r }) => (down ? r.top > cur.top + 2 : r.top < cur.top - 2));
    if (rows.length) {
      const rowTop = down ? Math.min(...rows.map(({ r }) => r.top)) : Math.max(...rows.map(({ r }) => r.top));
      const row = rows.filter(({ r }) => Math.abs(r.top - rowTop) < 2);
      row.sort((a, b) => Math.abs(a.r.left - cur.left) - Math.abs(b.r.left - cur.left));
      next = row[0].t;
    }
  } else return;
  e.preventDefault();
  if (!next) return;
  focusTile(next);
  select(next.dataset.iso2, false);
}

function focusTile(tile) {
  for (const t of visibleTiles()) t.tabIndex = -1;
  tile.tabIndex = 0;
  tile.focus();
}

function updateMap() {
  for (const tile of visibleTiles()) {
    const r = lookup(tile.dataset.iso2);
    const on = matches(r);
    tile.classList.toggle('off', !on);
    tile.setAttribute('aria-label', `${r.common_name}, ${tierWord(r)}${on ? '' : ', filtered out'}`);
    tile.setAttribute('aria-pressed', String(r.iso2 === state.selected));
    tile.tabIndex = r.iso2 === state.selected ? 0 : -1;
  }
}

function yesNo(v) {
  return v ? 'Yes' : 'No';
}

function renderDetail() {
  const r = lookup(state.selected);
  const box = $('#detail');
  box.textContent = '';
  if (!r) return;
  const alt = r.alt_tiers.length ? r.alt_tiers.map((t) => `Tier ${t}`).join(', ') : 'None';
  const rows = [
    ['ISO alpha-2', r.iso2],
    ['ISO alpha-3', r.iso3],
    ['ISO numeric', r.numeric ?? 'None'],
    ['Placed by', r.tier_basis === 'named' ? 'Named in the reference article' : 'Rule'],
    ['Other tiers in use', alt],
    ['Income group', incomeGroup(r.iso2) ?? 'Not classified'],
    ['Region', r.region ?? 'Not classified'],
    ['EU member', yesNo(isEU(r.iso2))],
    ['EU incl. territories', yesNo(isEU(r.iso2, { territories: true }))],
    ['EEA member', yesNo(isEEA(r.iso2))],
  ];
  const dl = el('dl');
  for (const [k, v] of rows) dl.append(el('dt', { text: k }), el('dd', { text: v }));
  box.append(
    el('div', { class: 'detail-head' },
      flag(r, 64, 48, 'flag'),
      el('div', {},
        el('p', { class: 'detail-label', text: 'Selected country' }),
        el('h3', { text: r.common_name }),
      ),
    ),
    r.name !== r.common_name ? el('p', { class: 'muted small', text: r.name }) : '',
    el('p', {}, el('span', { class: `badge t${r.tier}`, text: tierWord(r) }),
      r.iso_status === 'user-assigned' ? el('span', { class: 'muted small', text: ' User-assigned code' }) : ''),
    dl,
  );
}

const SORTERS = {
  name: byName,
  iso2: (a, b) => a.iso2.localeCompare(b.iso2),
  iso3: (a, b) => a.iso3.localeCompare(b.iso3),
  numeric: (a, b) => (a.numeric ?? '999').localeCompare(b.numeric ?? '999'),
  tier: (a, b) => a.tier - b.tier,
  income: (a, b) => ['HIC', 'UMC', 'LMC', 'LIC', null].indexOf(a.income_code) - ['HIC', 'UMC', 'LMC', 'LIC', null].indexOf(b.income_code),
  eu: (a, b) => Number(b.eu_member) - Number(a.eu_member),
  eea: (a, b) => Number(b.eea_member) - Number(a.eea_member),
};

function renderTable(rows) {
  const tbody = $('#table tbody');
  tbody.textContent = '';
  const sorted = [...rows].sort((a, b) => state.sortDir * SORTERS[state.sortKey](a, b) || byName(a, b));
  const frag = document.createDocumentFragment();
  for (const r of sorted) {
    const name = el('button', { type: 'button', class: 'link', 'data-iso2': r.iso2, text: r.common_name });
    frag.append(
      el('tr', { class: r.iso2 === state.selected ? 'sel' : null },
        el('td', {}, el('span', { class: 'cname' }, flag(r, 20, 15, 'flag'), name)),
        el('td', { class: 'mono', text: r.iso2 }),
        el('td', { class: 'mono', text: r.iso3 }),
        el('td', { class: 'mono', text: r.numeric ?? '-' }),
        el('td', {}, el('span', { class: `badge t${r.tier}`, text: String(r.tier) })),
        el('td', { text: r.income_group ?? 'Not classified' }),
        el('td', { text: r.eu_member ? 'Yes' : r.eu_territory ? 'Territory' : 'No' }),
        el('td', { text: yesNo(r.eea_member) }),
      ),
    );
  }
  if (!sorted.length) {
    frag.append(el('tr', {}, el('td', { colspan: '8', class: 'muted', text: 'No country matches these filters.' })));
  }
  tbody.append(frag);
  for (const th of document.querySelectorAll('#table th')) {
    const key = th.dataset.key;
    th.setAttribute('aria-sort', key === state.sortKey ? (state.sortDir === 1 ? 'ascending' : 'descending') : 'none');
  }
}

function update() {
  const rows = countries.filter(matches);
  const tiers = [1, 2, 3].map((t) => rows.filter((r) => r.tier === t).length);
  $('#count').textContent = `Showing ${rows.length} of ${countries.length} countries (Tier 1: ${tiers[0]}, Tier 2: ${tiers[1]}, Tier 3: ${tiers[2]})`;
  if (rows.length && !rows.some((r) => r.iso2 === state.selected)) {
    state.selected = rows[0].iso2;
    renderDetail();
  }
  $('#empty').hidden = rows.length > 0;
  updateMap();
  if (state.view === 'table') renderTable(rows);
}

function resetFilters() {
  for (const id of ['q', 'tier', 'income', 'group']) {
    $(`#${id}`).value = '';
    state[id] = '';
  }
  update();
  $('#q').focus();
}

function select(iso2, fromClick) {
  state.selected = iso2;
  history.replaceState(null, '', `#${iso2}`);
  renderDetail();
  updateMap();
  if (state.view === 'table') renderTable(countries.filter(matches));
  if (fromClick && window.matchMedia('(max-width: 899px)').matches) {
    $('#detail').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function setView(view) {
  state.view = view;
  $('#view-map').setAttribute('aria-pressed', String(view === 'map'));
  $('#view-table').setAttribute('aria-pressed', String(view === 'table'));
  $('#map-view').hidden = view !== 'map';
  $('#table-view').hidden = view !== 'table';
  update();
}

function splitCodes(value) {
  return value.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
}

function runBuilder() {
  const tiers = [...document.querySelectorAll('input[name="tiers"]:checked')].map((i) => Number(i.value));
  const format = $('#format').value;
  const alternates = $('#alternates').checked;
  const out = document.querySelector('input[name="out"]:checked').value;
  const output = $('#output');
  const count = $('#out-count');
  if (!tiers.length) {
    output.value = '';
    count.textContent = '(pick at least one tier)';
    $('#copy').disabled = true;
    return;
  }
  try {
    const codes = geoTargets(tiers, {
      alternates,
      format,
      include: splitCodes($('#include').value),
      exclude: splitCodes($('#exclude').value),
    });
    output.value = out === 'json' ? JSON.stringify(codes) : codes.join(',');
    output.removeAttribute('aria-invalid');
    count.textContent = `(${codes.length} codes)`;
    $('#copy').disabled = false;
  } catch (err) {
    output.value = err.message;
    output.setAttribute('aria-invalid', 'true');
    count.textContent = '(error)';
    $('#copy').disabled = true;
  }
}

async function renderSources() {
  try {
    const res = await fetch('data/sources.json');
    const src = await res.json();
    $('#updated').textContent = `Data last changed on ${src.updated}. A weekly workflow rebuilds it from the sources below.`;
    $('#stats').append(el('li', { class: 'chip', text: `Updated ${src.updated}` }));
    const list = $('#sources');
    for (const s of src.sources) {
      const meta = [s.version, s.license].filter(Boolean).join(', ');
      list.append(
        el('li', {},
          el('a', { href: s.url, text: s.name }),
          meta ? el('span', { class: 'muted', text: ` (${meta})` }) : '',
          el('br'),
          el('span', { class: 'muted small', text: `Fields: ${s.fields.join(', ')}` }),
        ),
      );
    }
  } catch {
    $('#updated').textContent = 'See data/sources.json for source versions and dates.';
  }
}

function init() {
  parseHash();
  renderStats();
  renderMap();
  renderDetail();
  for (const form of document.querySelectorAll('form')) form.addEventListener('submit', (e) => e.preventDefault());
  for (const id of ['q', 'tier', 'income', 'group']) {
    $(`#${id}`).addEventListener('input', (e) => {
      state[id] = e.target.value;
      update();
    });
  }
  $('#view-map').addEventListener('click', () => setView('map'));
  $('#view-table').addEventListener('click', () => setView('table'));
  $('#table thead').addEventListener('click', (e) => {
    const th = e.target.closest('th');
    if (!th) return;
    const key = th.dataset.key;
    state.sortDir = state.sortKey === key ? -state.sortDir : 1;
    state.sortKey = key;
    renderTable(countries.filter(matches));
  });
  $('#table tbody').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-iso2]');
    if (btn) select(btn.dataset.iso2, true);
  });
  $('#builder').addEventListener('input', runBuilder);
  $('#builder').addEventListener('change', runBuilder);
  $('#reset').addEventListener('click', resetFilters);
  window.addEventListener('hashchange', () => {
    parseHash();
    renderDetail();
    updateMap();
  });
  update();
  runBuilder();
  startTileFlags();
}

if (lib) {
  init();
} else {
  $('#load-error').hidden = false;
  $('#explorer').hidden = true;
  $('#build').hidden = true;
}
renderSources();
