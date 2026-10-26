import { describe, expect, it } from 'vitest'
import { canOnDutyDoctorTriageRequest } from './dispatch-access'

const NOW = Date.parse('2026-10-21T23:00:00.000Z')
const fresh = { is_on_duty: true, last_heartbeat_at: new Date(NOW - 15_000).toISOString() }

describe('doctor dispatch triage access', () => {
  it('allows only fresh on-duty doctors to triage searching requests', () => {
    expect(canOnDutyDoctorTriageRequest('searching', fresh, NOW)).toBe(true)
  })
  it.each(['matched', 'in_call', 'completed', 'cancelled', 'expired'])(
    'rejects on-duty triage access to %s requests',
    (status) => {
      expect(canOnDutyDoctorTriageRequest(status, fresh, NOW)).toBe(false)
    },
  )
  it('rejects an off-duty doctor', () => {
    expect(canOnDutyDoctorTriageRequest('searching', { ...fresh, is_on_duty: false }, NOW)).toBe(false)
  })
  it('rejects a stale heartbeat and a missing heartbeat', () => {
    expect(canOnDutyDoctorTriageRequest('searching', { is_on_duty: true, last_heartbeat_at: new Date(NOW - 91_000).toISOString() }, NOW)).toBe(false)
    expect(canOnDutyDoctorTriageRequest('searching', { is_on_duty: true, last_heartbeat_at: null }, NOW)).toBe(false)
  })
  it('rejects future and malformed heartbeat timestamps', () => {
    expect(canOnDutyDoctorTriageRequest('searching', { is_on_duty: true, last_heartbeat_at: new Date(NOW + 60_000).toISOString() }, NOW)).toBe(false)
    expect(canOnDutyDoctorTriageRequest('searching', { is_on_duty: true, last_heartbeat_at: 'invalid' }, NOW)).toBe(false)
  })
})
