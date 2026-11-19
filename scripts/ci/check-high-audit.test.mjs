import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAuditReport } from './check-high-audit.mjs';

const advisory = (severity, githubAdvisoryId, moduleName = 'example') => ({
  severity,
  github_advisory_id: githubAdvisoryId,
  module_name: moduleName,
  title: `${severity} advisory for ${moduleName}`,
});

test('moderate findings remain visible but do not become blocking advisories', () => {
  const result = summarizeAuditReport({
    metadata: { vulnerabilities: { moderate: 3, high: 0, critical: 0 } },
    advisories: { one: advisory('moderate', 'GHSA-moderate') },
  });

  assert.equal(result.moderateCount, 3);
  assert.equal(result.actionable.length, 0);
});

test('known Vite dev-server advisories are ignored while other high findings block', () => {
  const result = summarizeAuditReport({
    metadata: { vulnerabilities: { moderate: 0, high: 2, critical: 1 } },
    advisories: {
      vite: advisory('high', 'GHSA-v2wj-q39q-566r', 'vite'),
      undici: advisory('high', 'GHSA-undici', 'undici'),
      critical: advisory('critical', 'GHSA-critical', 'critical-package'),
    },
  });

  assert.equal(result.ignored.length, 1);
  assert.equal(result.actionable.length, 2);
  assert.deepEqual(
    result.actionable.map((item) => item.module_name),
    ['undici', 'critical-package'],
  );
});

test('missing audit advisory maps are handled safely', () => {
  const result = summarizeAuditReport({ metadata: { vulnerabilities: {} } });
  assert.equal(result.moderateCount, 0);
  assert.equal(result.actionable.length, 0);
});

test('malformed reports fail closed instead of silently passing', () => {
  assert.throws(
    () => summarizeAuditReport({ advisories: {} }),
    /missing metadata\.vulnerabilities/,
  );
});

test('reported high and critical counts without advisory details fail closed', () => {
  assert.throws(
    () =>
      summarizeAuditReport({
        metadata: { vulnerabilities: { high: 2, critical: 1 } },
        advisories: {},
      }),
    /no high\/critical advisory details/,
  );
});

test('invalid vulnerability counts fail closed', () => {
  assert.throws(
    () =>
      summarizeAuditReport({
        metadata: { vulnerabilities: { high: 'unknown', critical: 0 } },
        advisories: {},
      }),
    /invalid vulnerability counts/,
  );
});
