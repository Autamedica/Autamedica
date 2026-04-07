#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

// Temporary allowlist for Vite dev-server advisories published on April 6, 2026.
// They affect exposed development servers, but are currently blocking unrelated PRs
// across the repo until the shared Vite/Astro dependency stack is upgraded.
const NON_BLOCKING_GHSAS = new Set([
  'GHSA-v2wj-q39q-566r',
  'GHSA-p9ff-h696-f583',
]);

const audit = spawnSync('pnpm', ['audit', '--audit-level=high', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

if (!audit.stdout.trim()) {
  if (audit.stderr.trim()) {
    console.error(audit.stderr.trim());
  }
  process.exit(audit.status ?? 1);
}

let report;

try {
  report = JSON.parse(audit.stdout);
} catch (error) {
  console.error('Failed to parse pnpm audit JSON output.');
  if (audit.stderr.trim()) {
    console.error(audit.stderr.trim());
  }
  console.error(audit.stdout);
  throw error;
}

const advisories = Object.values(report.advisories ?? {}).filter((advisory) =>
  advisory && (advisory.severity === 'high' || advisory.severity === 'critical'),
);

const ignored = advisories.filter((advisory) =>
  advisory.github_advisory_id && NON_BLOCKING_GHSAS.has(advisory.github_advisory_id),
);

const actionable = advisories.filter(
  (advisory) => !advisory.github_advisory_id || !NON_BLOCKING_GHSAS.has(advisory.github_advisory_id),
);

if (ignored.length > 0) {
  console.log('Ignoring known non-blocking high advisories:');
  for (const advisory of ignored) {
    console.log(
      `- ${advisory.github_advisory_id} (${advisory.module_name}) ${advisory.title}`,
    );
  }
}

if (actionable.length === 0) {
  console.log('No actionable high/critical advisories found.');
  process.exit(0);
}

console.error('Actionable high/critical advisories found:');
for (const advisory of actionable) {
  console.error(
    `- ${advisory.github_advisory_id ?? advisory.id} (${advisory.module_name}) ${advisory.title}`,
  );
}

process.exit(1);
