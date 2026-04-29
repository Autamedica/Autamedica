import { describe, expect, it } from 'vitest'
import { isPastAppointmentStart, localDateTimeInputToIso } from './time'

describe('appointment time helpers', () => {
  it('converts date and time inputs from browser local time to an absolute ISO instant', () => {
    expect(localDateTimeInputToIso('2026-04-29', '09:00')).toBe('2026-04-29T12:00:00.000Z')
  })

  it('detects appointment starts in the past', () => {
    expect(isPastAppointmentStart('2026-04-29T11:59:59.000Z', new Date('2026-04-29T12:00:00.000Z'))).toBe(true)
    expect(isPastAppointmentStart('2026-04-29T12:00:01.000Z', new Date('2026-04-29T12:00:00.000Z'))).toBe(false)
  })
})
