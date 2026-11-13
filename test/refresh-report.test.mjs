import { test } from 'node:test';
import assert from 'node:assert/strict';
import { warningsFrom, reviewBody } from '../scripts/refresh-report.mjs';

test('collects each build warning once and ignores other output', () => {
  const log = [
    'warning: iso-codes v4.19.0 is out (pinned v4.18.0); review its changelog and bump sources/upstream.json',
    'warning: SC is Tier 3 by the income rule but the World Bank now lists it as High income',
    'warning: SC is Tier 3 by the income rule but the World Bank now lists it as High income',
    '250 countries: 20 in Tier 1, 73 in Tier 2, 157 in Tier 3',
    'no changes',
  ].join('\n');
  assert.deepEqual(warningsFrom(log), [
    'iso-codes v4.19.0 is out (pinned v4.18.0); review its changelog and bump sources/upstream.json',
    'SC is Tier 3 by the income rule but the World Bank now lists it as High income',
  ]);
  assert.deepEqual(warningsFrom('250 countries\nno changes\n'), []);
});

test('review body lists the warnings and the run', () => {
  const body = reviewBody(['a thing'], 'https://github.com/o/r/actions/runs/3');
  assert.match(body, /^- a thing$/m);
  assert.match(body, /Last run: https:\/\/github\.com\/o\/r\/actions\/runs\/3/);
});
