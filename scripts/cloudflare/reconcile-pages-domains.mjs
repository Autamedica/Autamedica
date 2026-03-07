#!/usr/bin/env node
/**
 * Reconcile Cloudflare Pages custom domains + DNS CNAME records.
 *
 * Requires CLOUDFLARE_API_TOKEN with:
 * - pages:write
 * - zone:read
 * - zone:edit
 */

import domainsConfig from '../config/domains.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID || '5b448192fe4b369642b68ad8f53a7603';
const ZONE_NAME = process.env.CLOUDFLARE_ZONE || domainsConfig.DOMAINS.apex;
const CLI_ARGS = new Set(process.argv.slice(2));
const DRY_RUN = CLI_ARGS.has('--dry-run');
const AUDIT_ONLY = CLI_ARGS.has('--audit') || CLI_ARGS.has('--verify-only');
const JSON_OUTPUT = CLI_ARGS.has('--json');
const PROJECT_FILTER = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--project='))
  ?.split('=')
  .at(1)
  ?.split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const PAGES_PROJECTS = [
  {
    project: 'autamedica-doctors',
    host: domainsConfig.DOMAINS.doctors,
    target: domainsConfig.PAGES_TARGETS.doctors,
  },
  {
    project: 'autamedica-patients',
    host: domainsConfig.DOMAINS.patients,
    target: domainsConfig.PAGES_TARGETS.patients,
  },
  {
    project: 'autamedica-companies',
    host: domainsConfig.DOMAINS.companies,
    target: domainsConfig.PAGES_TARGETS.companies,
  },
  {
    project: 'autamedica-admin',
    host: domainsConfig.DOMAINS.admin,
    target: domainsConfig.PAGES_TARGETS.admin,
  },
];

function log(message) {
  if (!JSON_OUTPUT) {
    console.log(message);
  }
}

function ensureToken() {
  if (!API_TOKEN) {
    console.error('❌ Missing CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }
}

function selectedProjects() {
  if (!PROJECT_FILTER?.length) {
    return PAGES_PROJECTS;
  }

  return PAGES_PROJECTS.filter((entry) => PROJECT_FILTER.includes(entry.project));
}

async function cf(path, init = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok || payload.success === false) {
    const errors = payload?.errors?.map((e) => `${e.code}: ${e.message}`).join('; ')
      || `HTTP ${response.status}`;
    throw new Error(`${path} -> ${errors}`);
  }
  return payload.result;
}

async function resolveZoneId() {
  const zones = await cf(`/zones?name=${encodeURIComponent(ZONE_NAME)}`);
  const zone = zones?.[0];
  if (!zone?.id) {
    throw new Error(`Zone not found: ${ZONE_NAME}`);
  }
  return zone.id;
}

async function ensurePagesDomain(project, host) {
  const domains = await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${project}/domains`);
  const exists = domains.some((entry) => entry.name === host);
  if (exists) {
    log(`ℹ️ Pages domain already exists: ${project} -> ${host}`);
    return { status: 'ok' };
  }

  if (AUDIT_ONLY) {
    log(`❌ Missing Pages domain: ${project} -> ${host}`);
    return { status: 'missing' };
  }

  if (DRY_RUN) {
    log(`🧪 [dry-run] Would add Pages domain: ${project} -> ${host}`);
    return { status: 'would_create' };
  }

  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${project}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: host }),
  });
  log(`✅ Added Pages domain: ${project} -> ${host}`);
  return { status: 'created' };
}

async function ensureCname(zoneId, host, target) {
  const existing = await cf(
    `/zones/${zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(host)}`,
  );

  const payload = {
    type: 'CNAME',
    name: host,
    content: target,
    proxied: true,
    ttl: 1,
    comment: 'Managed by scripts/cloudflare/reconcile-pages-domains.mjs',
  };

  if (existing.length > 0) {
    const current = existing[0];
    const matches = current.content === target && current.proxied === true;
    if (matches) {
      log(`ℹ️ CNAME already correct: ${host} -> ${target}`);
      return { status: 'ok', current: { content: current.content, proxied: current.proxied } };
    }

    if (AUDIT_ONLY) {
      log(`❌ Drift detected for CNAME: ${host} -> current=${current.content} proxied=${current.proxied}`);
      return {
        status: 'drift',
        current: { content: current.content, proxied: current.proxied },
        expected: { content: target, proxied: true },
      };
    }

    if (DRY_RUN) {
      log(`🧪 [dry-run] Would update CNAME: ${host} -> ${target}`);
      return {
        status: 'would_update',
        current: { content: current.content, proxied: current.proxied },
        expected: { content: target, proxied: true },
      };
    }

    await cf(`/zones/${zoneId}/dns_records/${current.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    log(`✅ Updated CNAME: ${host} -> ${target}`);
    return {
      status: 'updated',
      current: { content: target, proxied: true },
    };
  }

  if (AUDIT_ONLY) {
    log(`❌ Missing CNAME: ${host} -> ${target}`);
    return {
      status: 'missing',
      expected: { content: target, proxied: true },
    };
  }

  if (DRY_RUN) {
    log(`🧪 [dry-run] Would create CNAME: ${host} -> ${target}`);
    return {
      status: 'would_create',
      expected: { content: target, proxied: true },
    };
  }

  await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  log(`✅ Created CNAME: ${host} -> ${target}`);
  return {
    status: 'created',
    current: { content: target, proxied: true },
  };
}

function buildSummary(entries) {
  const driftStatuses = new Set(['missing', 'drift', 'would_create', 'would_update']);
  const hasDrift = entries.some((entry) => (
    driftStatuses.has(entry.pagesDomain.status) || driftStatuses.has(entry.dns.status)
  ));

  return {
    mode: AUDIT_ONLY ? 'audit' : DRY_RUN ? 'dry-run' : 'apply',
    zone: ZONE_NAME,
    accountId: ACCOUNT_ID,
    entries,
    hasDrift,
  };
}

async function main() {
  ensureToken();

  const projects = selectedProjects();
  if (!projects.length) {
    throw new Error(`No projects matched filter: ${PROJECT_FILTER?.join(', ')}`);
  }

  log(`☁️ Reconciling Cloudflare for zone ${ZONE_NAME}${DRY_RUN ? ' (dry-run)' : AUDIT_ONLY ? ' (audit)' : ''}`);

  const zoneId = await resolveZoneId();
  const entries = [];

  for (const entry of projects) {
    const pagesDomain = await ensurePagesDomain(entry.project, entry.host);
    const dns = await ensureCname(zoneId, entry.host, entry.target);

    entries.push({
      project: entry.project,
      host: entry.host,
      target: entry.target,
      pagesDomain,
      dns,
    });
  }

  const summary = buildSummary(entries);

  if (JSON_OUTPUT) {
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } else if (summary.hasDrift && AUDIT_ONLY) {
    console.error('❌ Cloudflare drift detected');
  } else {
    log('✅ Reconciliation completed');
  }

  if (summary.hasDrift && AUDIT_ONLY) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  if (error.message.includes('/dns_records') && error.message.includes('10000')) {
    console.error('❌ DNS API denied. Token must include zone:edit for autamedica.com.');
    console.error('   Current operation needs: read/update/create CNAME records.');
  } else {
    console.error(`❌ ${error.message}`);
  }
  process.exit(1);
});
