import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleUpdateCallStatus } from './handler.ts'

const callId = '00000000-0000-4000-8000-000000000001'
const request = (body: unknown, token = 'Bearer synthetic-test-jwt'): Request => new Request('https://example.test', {
  method: 'POST', headers: { Authorization: token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
function setup(options: { authorized?: boolean; error?: { code: string; message: string }; updated?: boolean } = {}) {
  const state = { header: '', rpcCalls: 0, rpcArgs: {} as Record<string, unknown> }
  const deps = {
    corsHeaders: {},
    createUserClient: (header: string) => {
      state.header = header
      return {
        auth: { getUser: async () => ({ data: { user: options.authorized === false ? null : { id: 'synthetic-user' } }, error: null }) },
        rpc: async (_name: string, args: Record<string, unknown>) => {
          state.rpcCalls++
          state.rpcArgs = args
          return { data: options.updated ?? true, error: options.error ?? null }
        },
      }
    },
  }
  return { state, deps }
}

test('missing bearer and invalid user never reach the database', async () => {
  const { state, deps } = setup({ authorized: false })
  assert.equal((await handleUpdateCallStatus(request({ callId, status: 'ended' }, ''), deps)).status, 401)
  assert.equal((await handleUpdateCallStatus(request({ callId, status: 'ended' }), deps)).status, 401)
  assert.equal(state.rpcCalls, 0)
})
test('forwards user JWT, normalizes legacy status and does not use an admin client', async () => {
  const { state, deps } = setup()
  const response = await handleUpdateCallStatus(request({ callId, status: 'completed' }), deps)
  assert.equal(response.status, 200)
  assert.equal(state.header, 'Bearer synthetic-test-jwt')
  assert.equal(state.rpcArgs.p_status, 'ended')
  assert.equal(response.headers.get('cache-control'), 'no-store')
})
test('a nonparticipant RPC denial returns 403 without leaking database messages', async () => {
  const { deps } = setup({ error: { code: '42501', message: 'private database details' } })
  const response = await handleUpdateCallStatus(request({ callId, status: 'ended' }), deps)
  assert.equal(response.status, 403)
  assert.doesNotMatch(await response.text(), /private database details/)
})
test('invalid inputs never reach status mutation', async () => {
  for (const body of [{ callId: 'invalid', status: 'ended' }, { callId, status: 'invented' }, { callId, status: 'ended', reason: {} }, []]) {
    const { deps, state } = setup()
    assert.equal((await handleUpdateCallStatus(request(body), deps)).status, 400)
    assert.equal(state.rpcCalls, 0)
  }
})
test('invalid transitions are conflicts; unknown errors stay redacted', async () => {
  for (const [code, expected] of [['22023', 409], ['XX000', 500]] as const) {
    const { deps } = setup({ error: { code, message: 'private database details' } })
    const response = await handleUpdateCallStatus(request({ callId, status: 'connected' }), deps)
    assert.equal(response.status, expected)
    assert.doesNotMatch(await response.text(), /private database details/)
  }
})
test('idempotent replay retains the successful response envelope with updated=false', async () => {
  const { deps } = setup({ updated: false })
  const response = await handleUpdateCallStatus(request({ callId, status: 'ended' }), deps)
  assert.deepEqual(await response.json(), { success: true, updated: false })
})
test('preflight and unsupported methods do not initialize a user client', async () => {
  const { deps, state } = setup()
  assert.equal((await handleUpdateCallStatus(new Request('https://example.test', { method: 'OPTIONS' }), deps)).status, 200)
  assert.equal((await handleUpdateCallStatus(new Request('https://example.test'), deps)).status, 405)
  assert.equal(state.header, '')
})
