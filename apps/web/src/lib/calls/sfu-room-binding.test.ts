import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { handleCloudflareCallsProxy } from '@autamedica/telemedicine/server'
import { handleRoomBoundCloudflareProxy } from './sfu-room-binding'

vi.mock('@autamedica/telemedicine/server', () => ({ handleCloudflareCallsProxy: vi.fn() }))

type Binding = { session_id: string; room_id: string; principal_key: string }
const req = (path: string, body: unknown = {}) => new Request('https://example.invalid/sfu', {
  method: 'POST',
  body: JSON.stringify({ roomId: 'jordan-room', path, method: path.endsWith('renegotiate') ? 'PUT' : 'POST', body }),
})

type DispatchRow = {
  id: string
  call_id: string | null
  status: string
  referral_partner_id?: string | null
  doctor_cf_session_id: string | null
  patient_cf_session_id: string | null
  call_started_at: string | null
}

function makeDb(opts: { jordan?: boolean; bindings?: Binding[]; dispatch?: DispatchRow }) {
  const inserted: unknown[] = []
  const dispatchUpdates: Array<Record<string, unknown>> = []
  const rpcCalls: Array<{ fn: string; params: Record<string, unknown> }> = []
  const dispatchState: DispatchRow | null = opts.dispatch
    ? { ...opts.dispatch }
    : opts.jordan
      ? {
          id: 'dispatch-jordan',
          call_id: null,
          status: 'matched',
          referral_partner_id: 'partner-jordan',
          doctor_cf_session_id: null,
          patient_cf_session_id: null,
          call_started_at: null,
        }
      : null

  const from = vi.fn((table: string) => {
    let targetSession: string | null = null
    let remoteIds: string[] = []
    let pendingUpdate: Record<string, unknown> | null = null
    const chain = {
      select: () => chain,
      update: (values: Record<string, unknown>) => {
        pendingUpdate = values
        if (table === 'pharmacy_dispatch_requests' && dispatchState) {
          dispatchUpdates.push(values)
          Object.assign(dispatchState, values)
        }
        return chain
      },
      eq: (field: string, value: string) => {
        if (field === 'session_id') targetSession = value
        return chain
      },
      in: (_field: string, values: string[]) => {
        remoteIds = values
        return chain
      },
      gt: () => chain,
      order: () => chain,
      limit: () => chain,
      maybeSingle: async () => {
        if (table === 'pharmacy_dispatch_requests') return {
          data: dispatchState ? { ...dispatchState } : null,
          error: null,
        }
        if (table === 'commercial_referral_partners') return {
          data: opts.jordan ? { code:'JORDAN' } : null,
          error: null,
        }
        if (table === 'sfu_room_session_bindings') return {
          data: opts.bindings?.find((b) => b.session_id === targetSession) ?? null,
          error: null,
        }
        return { data:null,error:null }
      },
      insert: async (value: unknown) => {
        inserted.push(value)
        return { error:null }
      },
      then(resolve: (v: unknown) => void) {
        if (pendingUpdate) {
          resolve({ data: dispatchState ? { ...dispatchState } : null, error: null })
          return
        }
        resolve({
          data: (opts.bindings ?? []).filter((b) => remoteIds.includes(b.session_id)),
          error: null,
        })
      },
    }
    return chain
  })
  const rpc = vi.fn(async (fn: string, params: Record<string, unknown>) => {
    rpcCalls.push({ fn, params })
    return { data: null, error: null }
  })
  return { admin: { from, rpc } as unknown as SupabaseClient, inserted, dispatchUpdates, rpcCalls, dispatchState }
}

describe('Cloudflare Calls room-bound session gate', () => {
  beforeEach(() => {
    vi.mocked(handleCloudflareCallsProxy).mockReset()
    vi.mocked(handleCloudflareCallsProxy).mockResolvedValue({
      status: 201, body: { sessionId: 'new-sfu-session' },
    })
  })

  it('preserves existing ordinary calls when rollout binding flag is off', async () => {
    const { admin } = makeDb({ jordan:false })
    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/new'), admin, 'jordan-room', 'user:authorized-user', {
        appId:'test',appSecret:'test',bindingsEnabled:false,
      })
    expect(result.status).toBe(201)
    expect(handleCloudflareCallsProxy).toHaveBeenCalledTimes(1)
  })

  it('fails closed for paid Jordan when session binding is not enabled', async () => {
    const { admin } = makeDb({ jordan:true })
    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/new'), admin, 'jordan-room', 'user:authorized-user', {
        appId:'test',appSecret:'test',bindingsEnabled:false,
      })
    expect(result.status).toBe(503)
    expect(handleCloudflareCallsProxy).not.toHaveBeenCalled()
  })

  it('records new Cloudflare session against authorized room and owner', async () => {
    const { admin,inserted } = makeDb({ jordan:true })
    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/new'), admin, 'jordan-room', 'user:authorized-user', {
        appId:'test',appSecret:'test',bindingsEnabled:true,
      })
    expect(result.status).toBe(201)
    expect(inserted).toEqual([{
      session_id:'new-sfu-session', room_id:'jordan-room', principal_key:'user:authorized-user',
    }])
  })

  it('rejects unknown or cross-owner target sessions before contacting Cloudflare', async () => {
    const { admin } = makeDb({
      jordan:true,
      bindings:[{session_id:'my-session',room_id:'jordan-room',principal_key:'user:someone-else'}],
    })
    const env = { appId:'test',appSecret:'test',bindingsEnabled:true }
    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/my-session/tracks/new',{tracks:[{location:'local',trackName:'audio0'}]}),
      admin,'jordan-room','user:authorized-user',env)
    expect(result.status).toBe(403)
    expect(handleCloudflareCallsProxy).not.toHaveBeenCalled()
  })

  it('allows a subscribed track only from another bound participant in the same room', async () => {
    const { admin } = makeDb({
      jordan:true,
      bindings:[
        {session_id:'my-session',room_id:'jordan-room',principal_key:'user:authorized-user'},
        {session_id:'doctor-session',room_id:'jordan-room',principal_key:'user:doctor-123'},
      ],
    })
    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/my-session/tracks/new',{tracks:[{
        location:'remote',sessionId:'doctor-session',trackName:'camera',
      }]}),
      admin,'jordan-room','user:authorized-user',{
        appId:'test',appSecret:'test',bindingsEnabled:true,
      })
    expect(result.status).toBe(201)
    expect(handleCloudflareCallsProxy).toHaveBeenCalledTimes(1)
  })

  it('denies forged remote sessions even if the requesting owner is authorized', async () => {
    const { admin } = makeDb({ jordan:true, bindings:[
      {session_id:'my-session',room_id:'jordan-room',principal_key:'user:authorized-user'},
    ] })
    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/my-session/tracks/new',{tracks:[{
        location:'remote',sessionId:'nonexistent-publisher',trackName:'camera',
      }]}),
      admin,'jordan-room','user:authorized-user',{
        appId:'test',appSecret:'test',bindingsEnabled:true,
      })
    expect(result.status).toBe(403)
    expect(handleCloudflareCallsProxy).not.toHaveBeenCalled()
  })

  it('rejects tracks from another room even when the local owner is valid', async () => {
    const { admin } = makeDb({
      jordan:true,
      bindings:[
        {session_id:'my-session',room_id:'jordan-room',principal_key:'user:authorized-user'},
        {session_id:'other-session',room_id:'other-room',principal_key:'user:other-user'},
      ],
    })
    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/my-session/tracks/new', {tracks:[{
        location:'remote', sessionId:'other-session', trackName:'video0',
      }]}),
      admin,'jordan-room','user:authorized-user',{
        appId:'test',appSecret:'test',bindingsEnabled:true,
      })
    expect(result.status).toBe(403)
    expect(handleCloudflareCallsProxy).not.toHaveBeenCalled()
  })

  it('persists doctor_cf_session_id and keeps call in connecting until patient session also exists', async () => {
    const { admin, dispatchUpdates, rpcCalls, dispatchState } = makeDb({
      jordan: false,
      dispatch: {
        id: 'req-br-1',
        call_id: 'call-uuid-1',
        status: 'matched',
        referral_partner_id: null,
        doctor_cf_session_id: null,
        patient_cf_session_id: null,
        call_started_at: null,
      },
    })
    vi.mocked(handleCloudflareCallsProxy).mockResolvedValueOnce({
      status: 201, body: { sessionId: 'cf-doctor-session-1' },
    })

    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/new'), admin, 'jordan-room', 'user:doctor-user-123', {
        appId: 'test', appSecret: 'test', bindingsEnabled: true, participantRole: 'doctor',
      })

    expect(result.status).toBe(201)
    expect(dispatchState?.doctor_cf_session_id).toBe('cf-doctor-session-1')
    expect(dispatchState?.patient_cf_session_id).toBeNull()
    expect(dispatchState?.status).toBe('matched')
    expect(dispatchUpdates).toEqual([{ doctor_cf_session_id: 'cf-doctor-session-1' }])
    expect(rpcCalls).toEqual([{
      fn: 'update_call_status',
      params: {
        p_call_id: 'call-uuid-1',
        p_status: 'connecting',
        p_reason: 'doctor_cf_session_created',
      },
    }])
  })

  it('promotes dispatch to in_call and calls to connected only when BOTH doctor and patient CF sessions exist', async () => {
    const { admin, rpcCalls, dispatchState } = makeDb({
      jordan: false,
      dispatch: {
        id: 'req-br-2',
        call_id: 'call-uuid-2',
        status: 'matched',
        referral_partner_id: null,
        doctor_cf_session_id: 'cf-doctor-session-2',
        patient_cf_session_id: null,
        call_started_at: null,
      },
    })
    vi.mocked(handleCloudflareCallsProxy).mockResolvedValueOnce({
      status: 201, body: { sessionId: 'cf-patient-session-2' },
    })

    const result = await handleRoomBoundCloudflareProxy(
      req('sessions/new'), admin, 'jordan-room', 'guest:token-hash-1234', {
        appId: 'test', appSecret: 'test', bindingsEnabled: false, participantRole: 'guest',
      })

    expect(result.status).toBe(201)
    expect(dispatchState?.doctor_cf_session_id).toBe('cf-doctor-session-2')
    expect(dispatchState?.patient_cf_session_id).toBe('cf-patient-session-2')
    expect(dispatchState?.status).toBe('in_call')
    expect(dispatchState?.call_started_at).toBeTruthy()
    expect(rpcCalls).toEqual([{
      fn: 'update_call_status',
      params: {
        p_call_id: 'call-uuid-2',
        p_status: 'connected',
        p_reason: 'both_cf_sessions_established',
      },
    }])
  })
})
