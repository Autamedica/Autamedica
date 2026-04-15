import { describe, it, expect } from 'vitest'
import { isTelemedicineCallWindowOpen } from './telemedicine-window'

describe('isTelemedicineCallWindowOpen', () => {
  const appointment = {
    start_time: '2026-03-25T14:00:00.000Z',
    duration_minutes: 60,
  }

  it('allows entry shortly before the appointment start', () => {
    // 44 min before
    expect(
      isTelemedicineCallWindowOpen(appointment, Date.parse('2026-03-25T13:16:00.000Z')),
    ).toBe(true)
  })

  it('blocks entry too early before the appointment start', () => {
    // 46 min before
    expect(
      isTelemedicineCallWindowOpen(appointment, Date.parse('2026-03-25T13:14:00.000Z')),
    ).toBe(false)
  })

  it('allows entry during the grace window (within 24h of end)', () => {
    // Appointment ends at 15:00. 23h 59m after end.
    expect(
      isTelemedicineCallWindowOpen(appointment, Date.parse('2026-03-26T14:59:00.000Z')),
    ).toBe(true)
  })

  it('blocks entry long after the appointment grace window ends', () => {
    // 24h 1min after end
    expect(
      isTelemedicineCallWindowOpen(appointment, Date.parse('2026-03-26T15:01:00.000Z')),
    ).toBe(false)
  })
})
