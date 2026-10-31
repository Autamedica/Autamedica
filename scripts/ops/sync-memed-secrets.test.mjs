import assert from 'node:assert/strict';
import { test } from 'node:test';
import { syncMemedSecrets } from './sync-memed-secrets.mjs';

const env = { MEMED_API_KEY: 'synthetic-key', MEMED_SECRET_KEY: 'synthetic-secret',
  CLOUDFLARE_API_TOKEN: 'synthetic-cloudflare-token',
  CLOUDFLARE_ACCOUNT_ID: '5b448192fe4b369642b68ad8f53a7603' };
const initial = { MEMED_API_URL: { type: 'plain_text', value: 'https://api.memed.com.br/v1' },
  MEMED_SCRIPT_URL: { type: 'plain_text', value: 'https://partners.memed.com.br/integration.js' },
  MEMED_RX_ENABLED: { type: 'plain_text', value: 'false' },
  OTHER_SECRET: { type: 'secret_text', value: '' } };
const response = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const project = vars => response({ success: true, result: { deployment_configs: { production: { env_vars: vars } } } });
const validKeys = () => response({ success: [{ code: 'chave-valida' }] });

test('missing source credentials blocks explicitly without network calls', async () => {
  let called = false;
  const result = await syncMemedSecrets({}, async () => { called = true; });
  assert.equal(result.status, 'blocked');
  assert.ok(result.missing.includes('MEMED_API_KEY'));
  assert.equal(called, false);
});
test('wrong account is rejected before any credential transfer', async () => {
  await assert.rejects(syncMemedSecrets({ ...env, CLOUDFLARE_ACCOUNT_ID: 'other' },
    async () => { throw new Error('must not call'); }), /account_mismatch/);
});
test('invalid Memed keys never reach Cloudflare', async () => {
  let calls = 0;
  await assert.rejects(syncMemedSecrets(env, async () => { calls++; return response({}, false, 401); }), /memed_check_key_http_401/);
  assert.equal(calls, 1);
});
test('provider success without key acceptance does not mutate configuration', async () => {
  await assert.rejects(syncMemedSecrets(env, async () => response({ success: [] })), /keys_not_accepted/);
});
test('only production doctor secrets are patched; issuance and other settings remain intact', async () => {
  const calls = [];
  const after = { ...initial, MEMED_API_KEY: { type: 'secret_text', value: '' },
    MEMED_SECRET_KEY: { type: 'secret_text', value: '' } };
  const outputs = [validKeys(), project(initial), response({ success: true }), project(after)];
  const result = await syncMemedSecrets(env, async (url, options) => {
    calls.push({ url, options }); return outputs.shift();
  });
  assert.equal(result.status, 'configured');
  assert.equal(calls.length, 4);
  assert.ok(calls[2].url.endsWith('/pages/projects/autamedica-doctors'));
  assert.deepEqual(JSON.parse(calls[2].options.body), { deployment_configs: { production: { env_vars: {
    MEMED_API_KEY: { type: 'secret_text', value: env.MEMED_API_KEY },
    MEMED_SECRET_KEY: { type: 'secret_text', value: env.MEMED_SECRET_KEY },
  } } } });
  assert.ok(!JSON.stringify(result).includes(env.MEMED_SECRET_KEY));
  for (const call of calls) assert.equal(call.options.redirect, 'error');
});
test('nonproduction environment is rejected before PATCH', async () => {
  const outputs = [validKeys(), project({ ...initial, MEMED_API_URL: { value: 'https://other.invalid' } })];
  await assert.rejects(syncMemedSecrets(env, async () => outputs.shift()), /environment_mismatch/);
});
test('unconfirmed secret bindings fail verification', async () => {
  const outputs = [validKeys(), project(initial), response({ success: true }), project(initial)];
  await assert.rejects(syncMemedSecrets(env, async () => outputs.shift()), /bindings_not_confirmed/);
});
test('unexpected feature flag changes fail verification', async () => {
  const after = { ...initial, MEMED_API_KEY: { type: 'secret_text' }, MEMED_SECRET_KEY: { type: 'secret_text' },
    MEMED_RX_ENABLED: { type: 'plain_text', value: 'true' } };
  const outputs = [validKeys(), project(initial), response({ success: true }), project(after)];
  await assert.rejects(syncMemedSecrets(env, async () => outputs.shift()), /unrelated_configuration_changed/);
});
test('transport and parser errors never contain private fragments', async () => {
  await assert.rejects(syncMemedSecrets(env, async () => { throw new Error('private-key-fragment'); }),
    error => error.message === 'memed_check_key_transport_failed');
  await assert.rejects(syncMemedSecrets(env, async () => ({ ok: true, json: async () => { throw new SyntaxError('private-body'); } })),
    error => error.message === 'memed_check_key_invalid_response');
});
