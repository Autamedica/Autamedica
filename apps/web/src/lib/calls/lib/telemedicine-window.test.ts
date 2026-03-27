import { describe, expect, it } from 'vitest'
import { isTelemedicineCallWindowOpen } from '@/lib/calls/lib/telemedicine-window'

describe('isTelemedicineCallWindowOpen', () => {
  it('allows entry shortly before the appointment start', () => {
    const appointment = {
      start_time: '2026-03-26T14:00:00.000Z',
      end_time: '2026-03-26T14:30:00.000Z',
      duration_minutes: 30,
    }

    expect(
      isTelemedicineCallWindowOpen(appointment, Date.parse('2026-03-26T13:20:00.000Z')),
    ).toBe(true)
  })

  it('blocks entry too early before the appointment start', () => {
    const appointment = {
      start_time: '2026-03-26T14:00:00.000Z',
      end_time: '2026-03-26T14:30:00.000Z',
      duration_minutes: 30,
    }

    expect(
      isTelemedicineCallWindowOpen(appointment, Date.parse('2026-03-26T13:10:00.000Z')),
    ).toBe(false)
  })

  it('blocks entry long after the appointment grace window ends', () => {
    const appointment = {
      start_time: '2026-03-26T14:00:00.000Z',
      end_time: '2026-03-26T14:30:00.000Z',
      duration_minutes: 30,
    }

    expect(
      isTelemedicineCallWindowOpen(appointment, Date.parse('2026-03-26T17:00:01.000Z')),
    ).toBe(false)
  })
})
