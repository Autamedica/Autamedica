import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../apps/web/public/sw.js', import.meta.url), 'utf8');
function worker({ cached = null, policy = '', type = 'application/javascript', fail = '' } = {}) {
  const handlers = new Map();
  const calls = { matches: 0, puts: 0, fetches: 0, deleted: [], claimed: 0, skipped: 0 };
  const cache = {
    async match() { calls.matches++; if (fail === 'match') throw new Error('storage denied'); return cached; },
    async put() { calls.puts++; if (fail === 'put') throw new Error('quota'); },
  };
  runInNewContext(source, {
    URL,
    self: {
      location: { origin: 'https://paciente.autamedica.com' },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => { calls.skipped++; },
      clients: { claim: async () => { calls.claimed++; } },
    },
    caches: {
      async keys() { if (fail === 'keys') throw new Error('storage denied'); return ['autamedica-static-v1', 'autamedica-dynamic-v1', 'autamedica-static-v2', 'unrelated']; },
      async open() { if (fail === 'open') throw new Error('storage denied'); return cache; },
      async delete(key) { calls.deleted.push(key); if (fail === 'delete') throw new Error('storage denied'); },
    },
    fetch: async () => {
      calls.fetches++;
      return new Response('public asset', { headers: { 'Cache-Control': policy, 'Content-Type': type } });
    },
  });
  return { handlers, calls };
}

test('private API/portal requests never fall back to an old cached directory or patient page', () => {
  for (const path of ['/api/patients/doctors', '/api/patients/care-country', '/api/doctors/profile', '/patients/appointments', '/doctors/agenda', '/']) {
    const { handlers, calls } = worker({ cached: new Response('old private directory') });
    let intercepted = false;
    handlers.get('fetch')({ request: new Request('https://paciente.autamedica.com' + path), respondWith() { intercepted = true; } });
    assert.equal(intercepted, false, path);
    assert.equal(calls.matches, 0, path);
    assert.equal(calls.puts, 0, path);
  }
});

test('activation deletes old clinical caches before claiming clients', async () => {
  const { handlers, calls } = worker();
  let completion;
  handlers.get('activate')({ waitUntil(promise) { completion = promise; } });
  await completion;
  assert.deepEqual(calls.deleted.sort(), ['autamedica-dynamic-v1', 'autamedica-static-v1']);
  assert.equal(calls.claimed, 1);
});

test('install does not pre-cache authenticated root HTML', async () => {
  const { handlers, calls } = worker();
  let completion;
  handlers.get('install')({ waitUntil(promise) { completion = promise; } });
  await completion;
  assert.equal(calls.skipped, 1);
  assert.equal(calls.fetches, 0);
});

test('only public static assets are cached and private/no-store responses are respected', async () => {
  for (const [policy, type, expected] of [
    ['public, max-age=31536000', 'application/javascript', 1],
    ['private', 'application/javascript', 0],
    ['no-store', 'application/javascript', 0],
    ['', 'text/html', 0],
  ]) {
    const { handlers, calls } = worker({ policy, type });
    let response;
    handlers.get('fetch')({ request: new Request('https://paciente.autamedica.com/_astro/public.js'), respondWith(promise) { response = promise; } });
    assert.equal((await response).status, 200);
    assert.equal(calls.puts, expected, policy + ':' + type);
  }
});

test('authenticated asset requests and foreign origins are never intercepted', () => {
  for (const request of [
    new Request('https://paciente.autamedica.com/images/private.png', { headers: { Authorization: 'Bearer synthetic-test-token' } }),
    new Request('https://example.supabase.co/storage/private.png'),
  ]) {
    const { handlers, calls } = worker();
    let intercepted = false;
    handlers.get('fetch')({ request, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
    assert.equal(calls.matches, 0);
  }
});

test('cache read/write errors still return public assets from the network', async () => {
  for (const fail of ['open', 'match', 'put']) {
    const { handlers, calls } = worker({ fail });
    let response;
    handlers.get('fetch')({ request: new Request('https://paciente.autamedica.com/_astro/public.js'), respondWith(promise) { response = promise; } });
    assert.equal(await (await response).text(), 'public asset');
    assert.equal(calls.fetches, 1);
  }
});

test('cleanup failures still activate the worker that never serves clinical caches', async () => {
  for (const fail of ['keys', 'delete']) {
    const { handlers, calls } = worker({ fail });
    let completion;
    handlers.get('activate')({ waitUntil(promise) { completion = promise; } });
    await completion;
    assert.equal(calls.claimed, 1);
  }
});
