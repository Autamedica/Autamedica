#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Temporary allowlist for Vite dev-server advisories published on April 6, 2026.
// They affect exposed development servers, but are currently blocking unrelated PRs
// across the repo until the shared Vite/Astro dependency stack is upgraded.
const NON_BLOCKING_GHSAS = new Set([
  'GHSA-v2wj-q39q-566r',
  'GHSA-p9ff-h696-f583',
  'GHSA-xq3m-2v4x-88gg',
]);

export function summarizeAuditReport(report) {
  if (
    !report ||
    typeof report !== 'object' ||
    !report.metadata?.vulnerabilities ||
    typeof report.metadata.vulnerabilities !== 'object'
  ) {
    throw new TypeError(
      'pnpm audit JSON is missing metadata.vulnerabilities; refusing to treat an invalid report as clean.',
    );
  }

  const moderateCount = Number(report.metadata.vulnerabilities.moderate ?? 0);
  const highCount = Number(report.metadata.vulnerabilities.high ?? 0);
  const criticalCount = Number(report.metadata.vulnerabilities.critical ?? 0);

  if (
    ![moderateCount, highCount, criticalCount].every(
      (count) => Number.isInteger(count) && count >= 0,
    )
  ) {
    throw new TypeError('pnpm audit JSON contains invalid vulnerability counts.');
  }

  const hasBlockingFindings = highCount + criticalCount > 0;
  if (
    hasBlockingFindings &&
    (!report.advisories ||
      typeof report.advisories !== 'object' ||
      Array.isArray(report.advisories))
  ) {
    throw new TypeError(
      'pnpm audit reports high/critical vulnerabilities but has no advisory details; refusing to pass.',
    );
  }

  const advisories = Object.values(report.advisories ?? {}).filter(
    (advisory) => advisory && (advisory.severity === 'high' || advisory.severity === 'critical'),
  );
  if (hasBlockingFindings && advisories.length === 0) {
    throw new TypeError(
      'pnpm audit reports high/critical vulnerabilities but contains no high/critical advisory details; refusing to pass.',
    );
  }

  const ignored = advisories.filter(
    (advisory) =>
      advisory.github_advisory_id && NON_BLOCKING_GHSAS.has(advisory.github_advisory_id),
  );
  const actionable = advisories.filter(
    (advisory) =>
      !advisory.github_advisory_id || !NON_BLOCKING_GHSAS.has(advisory.github_advisory_id),
  );

  return {
    moderateCount,
    highCount,
    criticalCount,
    ignored,
    actionable,
  };
}

function loadAuditReport() {
  const reportPath = process.argv[2];
  if (reportPath) {
    return JSON.parse(readFileSync(reportPath, 'utf8'));
  }

  const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const audit = spawnSync(command, ['audit', '--audit-level=high', '--json'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32',
  });

  if (!audit.stdout?.trim()) {
    if (audit.stderr?.trim()) console.error(audit.stderr.trim());
    if (audit.error) console.error(audit.error.message);
    process.exit(audit.status && audit.status !== 0 ? audit.status : 1);
  }

  try {
    return JSON.parse(audit.stdout);
  } catch (error) {
    console.error('Failed to parse pnpm audit JSON output.');
    if (audit.stderr?.trim()) console.error(audit.stderr.trim());
    console.error(audit.stdout);
    throw error;
  }
}

function main() {
  const summary = summarizeAuditReport(loadAuditReport());

  if (summary.moderateCount > 0) {
    console.warn(
      `::warning::${summary.moderateCount} moderate dependency advisories remain (non-blocking).`,
    );
  }

  if (summary.ignored.length > 0) {
    console.log('Ignoring known non-blocking high advisories:');
    for (const advisory of summary.ignored) {
      console.log(`- ${advisory.github_advisory_id} (${advisory.module_name}) ${advisory.title}`);
    }
  }

  if (summary.actionable.length === 0) {
    console.log('No actionable high/critical advisories found.');
    return;
  }

  console.error('Actionable high/critical advisories found:');
  for (const advisory of summary.actionable) {
    console.error(
      `- ${advisory.github_advisory_id ?? advisory.id} (${advisory.module_name}) ${advisory.title}`,
    );
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
