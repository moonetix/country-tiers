#!/usr/bin/env node
// Reads the output of `node scripts/build.mjs` and keeps the "Data refresh"
// issue in step with it: the build's warnings (a newer iso-codes release, a
// World Bank income group that no longer fits a country's tier, a European
// page that could not be parsed) need a human, so they are listed in one open
// issue. A run without warnings closes it.
//
//   node scripts/refresh-report.mjs build.log [--issue]
//
// Without --issue the would-be issue is printed.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { githubClient, upsertIssue, closeIssue, runUrl } from './github-issue.mjs';

export const TOPIC = 'data-refresh';

export function warningsFrom(log) {
  return [...new Set(log.split('\n').filter((l) => l.startsWith('warning: ')).map((l) => l.slice(9).trim()))];
}

export function reviewBody(warnings, run) {
  return [
    'The weekly refresh rebuilt `data/` from the upstream sources, but some of what it found needs a decision before it goes into the data:',
    '',
    ...warnings.map((w) => `- ${w}`),
    '',
    'Edit `sources/upstream.json`, `sources/tiers.json` or `sources/memberships.json` as needed, run `node scripts/build.mjs`, and commit. This issue is updated every week and closes itself after a run without warnings.',
    '',
    `Last run: ${run}`,
  ].join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const logPath = args.find((a) => !a.startsWith('--'));
  if (!logPath) throw new Error('usage: refresh-report.mjs build.log [--issue]');
  const warnings = warningsFrom(readFileSync(logPath, 'utf8'));
  const request = args.includes('--issue') ? githubClient() : null;
  if (args.includes('--issue') && !request) throw new Error('--issue needs GITHUB_TOKEN and GITHUB_REPOSITORY');
  if (warnings.length) {
    await upsertIssue(request, { topic: TOPIC, title: `Data refresh needs review: ${warnings.length} item${warnings.length === 1 ? '' : 's'}`, body: reviewBody(warnings, runUrl()) });
  } else {
    await closeIssue(request, { topic: TOPIC, comment: 'The latest refresh finished without warnings.' });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
