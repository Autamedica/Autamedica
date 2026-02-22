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
const DRY_RUN = process.argv.includes('--dry-run');

const PAGES_PROJECTS = [
  {
    project: 'autamedica-doctors',
    host: domainsConfig.DOMAINS.doctors,
    target: domainsConfig.PAGES_TARGETS.doctors,
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

function ensureToken() {
  if (!API_TOKEN) {
    console.error('❌ Missing CLOUDFLARE_API_TOKEN');
    process.exit(1);
  }
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
    console.log(`ℹ️ Pages domain already exists: ${project} -> ${host}`);
    return;
  }

  if (DRY_RUN) {
    console.log(`🧪 [dry-run] Would add Pages domain: ${project} -> ${host}`);
    return;
  }

  await cf(`/accounts/${ACCOUNT_ID}/pages/projects/${project}/domains`, {
    method: 'POST',
    body: JSON.stringify({ name: host }),
  });
  console.log(`✅ Added Pages domain: ${project} -> ${host}`);
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
      console.log(`ℹ️ CNAME already correct: ${host} -> ${target}`);
      return;
    }

    if (DRY_RUN) {
      console.log(`🧪 [dry-run] Would update CNAME: ${host} -> ${target}`);
      return;
    }

    await cf(`/zones/${zoneId}/dns_records/${current.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    console.log(`✅ Updated CNAME: ${host} -> ${target}`);
    return;
  }

  if (DRY_RUN) {
    console.log(`🧪 [dry-run] Would create CNAME: ${host} -> ${target}`);
    return;
  }

  await cf(`/zones/${zoneId}/dns_records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  console.log(`✅ Created CNAME: ${host} -> ${target}`);
}

async function main() {
  ensureToken();
  console.log(`☁️ Reconciling Cloudflare for zone ${ZONE_NAME}${DRY_RUN ? ' (dry-run)' : ''}`);

  const zoneId = await resolveZoneId();
  for (const entry of PAGES_PROJECTS) {
    await ensurePagesDomain(entry.project, entry.host);
    await ensureCname(zoneId, entry.host, entry.target);
  }

  console.log('✅ Reconciliation completed');
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
