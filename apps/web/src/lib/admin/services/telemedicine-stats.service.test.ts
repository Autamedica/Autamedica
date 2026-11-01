import { describe, expect, it } from 'vitest'
import { computeTelemedicineStats } from './telemedicine-stats.service'
import { telemedicineStatsRepository } from '../repositories/telemedicine-stats.repository'
import type { CallRow, CallEvidence } from '../repositories/telemedicine-stats.repository'
import type { SupabaseClient } from '@supabase/supabase-js'

const now = new Date('2026-11-01T17:00:00Z')
const call = (changes: Partial<CallRow> = {}): CallRow => ({
  id: 'call-1', room_id: 'room_1', status: 'ended', doctor_id: null,
  patient_id: null, appointment_id: null, created_at: '2026-09-27T10:00:00Z',
  accepted_at: '2026-09-27T10:02:00Z', ended_at: '2026-09-27T10:15:00Z',
  ...changes,
})
const media = (changes: Partial<CallEvidence> = {}): CallEvidence => ({
  call_id: 'call-1', type: 'first_remote_media', at: '2026-09-27T10:05:00Z',
  payload: { userType: 'patient' }, ...changes,
})

describe('telemedicine dashboard evidence', () => {
  it('measures from media connection, excluding room creation and acceptance wait', () => {
    const result = computeTelemedicineStats([call()], [media()], now)
    expect(result.stats.avgDurationSeconds).toBe(600)
    expect(result.stats.durationSampleCount).toBe(1)
    expect(result.stats.calls7d).toBe(0)
    expect(result.recentCalls[0].doctor_joined).toBeNull()
    expect(result.recentCalls[0].patient_joined).toBe(true)
  })

  it('does not turn missing evidence into zero duration or a no-show', () => {
    const result = computeTelemedicineStats([call()], [], now)
    expect(result.stats.avgDurationSeconds).toBeNull()
    expect(result.stats.durationExcludedCount).toBe(1)
    expect(result.recentCalls[0].doctor_joined).toBeNull()
    expect(result.recentCalls[0].duration_seconds).toBeNull()
  })

  it('excludes multi-day, reversed, future and explicit test intervals', () => {
    for (const changes of [
      { ended_at: '2026-10-08T20:00:00Z' },
      { ended_at: '2026-09-27T10:04:00Z' },
      { ended_at: '2026-11-02T10:00:00Z' },
      { room_id: 'cf-room-test-gen2-1' },
    ]) {
      const result = computeTelemedicineStats([call(changes)], [media()], now)
      expect(result.stats.avgDurationSeconds).toBeNull()
      expect(result.stats.totalCalls).toBe(1)
    }
  })

  it('preserves raw state while identifying stale or inconsistently closed calls', () => {
    const result = computeTelemedicineStats([
      call({ status: 'connected', ended_at: null }),
      call({ id: 'call-2', status: 'requested' }),
    ], [], now)
    expect(result.stats.staleCalls).toBe(2)
    expect(result.stats.byStatus.stale).toBe(2)
    expect(result.recentCalls[0].stored_status).toBe('connected')
    expect(result.recentCalls[0].duration_seconds).toBeNull()
  })

  it('reads nested successful participant evidence without requiring simultaneous presence', () => {
    const result = computeTelemedicineStats([call()], [
      media(), media({ type: 'join_succeeded', payload: { payload: { userType: 'doctor' } } }),
    ], now)
    expect(result.recentCalls[0].doctor_joined).toBe(true)
    expect(result.recentCalls[0].patient_joined).toBe(true)
  })

  it('ignores evidence before room creation and after the snapshot time', () => {
    const result = computeTelemedicineStats([call()], [
      media({ at: '2026-09-26T10:00:00Z' }), media({ at: '2026-11-02T10:00:00Z' }),
    ], now)
    expect(result.stats.avgDurationSeconds).toBeNull()
    expect(result.recentCalls[0].patient_joined).toBeNull()
    expect(result.stats.connected).toBe(0)
  })

  it('does not count a room join or orphan event as a media connection', () => {
    const result = computeTelemedicineStats([call()], [
      media({ type: 'join_succeeded' }), media({ call_id: 'another-call' }),
    ], now)
    expect(result.stats.connected).toBe(0)
  })

  it('paginates beyond 1000 calls and propagates query failure', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => call({ id: String(index) }))
    const builder = {
      select: () => builder, lte: () => builder, order: () => builder,
      range: async (start: number, end: number) => ({ data: rows.slice(start, end + 1), error: null }),
    }
    const admin = { from: () => builder } as unknown as SupabaseClient
    expect(await telemedicineStatsRepository.getCalls(admin, now.toISOString())).toHaveLength(1001)
    const failure = new Error('database unavailable')
    const broken = {
      select: () => broken, lte: () => broken, order: () => broken,
      range: async () => ({ data: null, error: failure }),
    }
    await expect(telemedicineStatsRepository.getCalls(
      { from: () => broken } as unknown as SupabaseClient,
      now.toISOString()
    )).rejects.toThrow('database unavailable')
  })
})
