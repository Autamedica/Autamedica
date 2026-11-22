#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

const DEFAULT_PROJECTS = ['autamedica-web', 'autamedica-doctors', 'autamedica-admin'];
const ACCOUNT = '5b448192fe4b369642b68ad8f53a7603';
const KEYS = ['MEMED_API_KEY', 'MEMED_SECRET_KEY'];

export async function syncMemedSecrets(env, fetcher = fetch) {
  const missing = [...KEYS, 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']
    .filter(key => typeof env[key] !== 'string' || !env[key].trim());
  // Memed is optional and currently disabled. An explicit blocked result must
  // not take down unrelated app deployments or invent replacement credentials.
  if (missing.length) return { status: 'blocked', missing };
  if (env.CLOUDFLARE_ACCOUNT_ID !== ACCOUNT) throw new Error('memed_cloudflare_account_mismatch');

  const projects = typeof env.MEMED_SYNC_PROJECTS === 'string' && env.MEMED_SYNC_PROJECTS.trim()
    ? env.MEMED_SYNC_PROJECTS.split(',').map(name => name.trim()).filter(Boolean)
    : DEFAULT_PROJECTS;

  async function request(url, options, label, allowedStatuses = []) {
    let response;
    try {
      response = await fetcher(url, { ...options, redirect: 'error',
        cache: 'no-store', signal: AbortSignal.timeout(10000) });
    } catch {
      throw new Error(label + '_transport_failed');
    }
    let body;
    try { body = await response.json(); } catch { throw new Error(label + '_invalid_response'); }
    if (!response.ok && !allowedStatuses.includes(response.status)) {
      throw new Error(label + '_http_' + response.status);
    }
    return { status: response.status, body };
  }

  // Validate partner credentials via the read-only usuarios lookup (matches memed-preflight.mjs).
  // Memed returns 200 for an existing doctor or 404 "Nenhum usuário encontrado" when keys are valid.
  const probeId = typeof env.MEMED_PREFLIGHT_DOCTOR_EXTERNAL_ID === 'string'
    && /^[a-zA-Z0-9-]{1,255}$/.test(env.MEMED_PREFLIGHT_DOCTOR_EXTERNAL_ID)
    ? env.MEMED_PREFLIGHT_DOCTOR_EXTERNAL_ID
    : 'autamedica-healthcheck-readonly';
  const checkUrl = new URL(`/v1/sinapse-prescricao/usuarios/${encodeURIComponent(probeId)}`, 'https://api.memed.com.br');
  for (const key of KEYS) {
    checkUrl.searchParams.set(key === 'MEMED_API_KEY' ? 'api-key' : 'secret-key', env[key].trim());
  }
  const probe = await request(
    checkUrl.toString(),
    {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/json',
        'User-Agent': 'Autamedica-Memed-Secret-Sync/1.0',
      },
    },
    'memed_check_key',
    [404],
  );
  const doctorFound = probe.status === 200
    && probe.body?.data?.type === 'usuarios'
    && Boolean(probe.body?.data?.attributes && typeof probe.body.data.attributes === 'object');
  const doctorNotRegistered = probe.status === 404
    && Array.isArray(probe.body?.errors)
    && probe.body.errors.some(entry => /nenhum usu[aá]rio encontrado/i.test(String(entry?.detail ?? '')));
  if (!doctorFound && !doctorNotRegistered) {
    throw new Error('memed_keys_not_accepted');
  }

  const headers = { Authorization: 'Bearer ' + env.CLOUDFLARE_API_TOKEN, 'Content-Type': 'application/json' };
  const configuredProjects = [];

  for (const projectName of projects) {
    const endpoint = 'https://api.cloudflare.com/client/v4/accounts/' + ACCOUNT + '/pages/projects/' + projectName;
    async function loadProjectVars() {
      const { body } = await request(endpoint, { method: 'GET', headers }, 'cloudflare_project');
      if (body?.success !== true || !body.result?.deployment_configs?.production?.env_vars) {
        throw new Error('cloudflare_project_configuration_unavailable');
      }
      return body.result.deployment_configs.production.env_vars;
    }
    const before = await loadProjectVars();
    if ((before.MEMED_API_URL && before.MEMED_API_URL.value !== 'https://api.memed.com.br/v1') ||
        (before.MEMED_SCRIPT_URL && before.MEMED_SCRIPT_URL.value !== 'https://partners.memed.com.br/integration.js')) {
      throw new Error('memed_production_environment_mismatch');
    }
    const unchanged = vars => JSON.stringify(Object.entries(vars)
      .filter(([key]) => !KEYS.includes(key)).sort(([a], [b]) => a.localeCompare(b)));
    const protectedConfig = unchanged(before);
    // PATCH merges individual variables. Never send nulls or read-back redacted secrets.
    const { body: updated } = await request(endpoint, { method: 'PATCH', headers,
      body: JSON.stringify({ deployment_configs: { production: { env_vars:
        Object.fromEntries(KEYS.map(key => [key, { type: 'secret_text', value: env[key].trim() }])) } } }),
    }, 'cloudflare_secret_sync');
    if (updated?.success !== true) throw new Error('cloudflare_secret_sync_rejected');
    const after = await loadProjectVars();
    if (KEYS.some(key => after[key]?.type !== 'secret_text')) {
      throw new Error('cloudflare_secret_bindings_not_confirmed');
    }
    if (unchanged(after) !== protectedConfig) throw new Error('cloudflare_unrelated_configuration_changed');
    configuredProjects.push(projectName);
  }

  return { status: 'configured', projects: configuredProjects, credentialsAccepted: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await syncMemedSecrets(process.env);
    if (result.status === 'blocked') {
      console.warn('::warning::Memed configuration blocked; missing GitHub Actions secrets: ' + result.missing.join(', '));
    }
    console.log(JSON.stringify(result));
  } catch {
    // Never print request URLs, provider bodies or native fetch/parser errors.
    console.error('Memed credential configuration failed; no credential values were logged.');
    process.exitCode = 1;
  }
}
