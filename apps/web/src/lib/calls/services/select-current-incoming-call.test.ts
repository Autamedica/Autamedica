import { describe, expect, it } from 'vitest'
import type { Call } from '@autamedica/telemedicine'
import { selectCurrentIncomingCall } from '@/lib/calls/services/select-current-incoming-call'

function makeCall(overrides: Partial<Call>): Call {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    room_id: overrides.room_id ?? `room_${Math.random().toString(36).slice(2, 10)}`,
    doctor_id: overrides.doctor_id ?? 'doctor-1',
    patient_id: overrides.patient_id ?? 'patient-1',
    status: overrides.status ?? 'ringing',
    created_at: overrides.created_at ?? '2026-03-26T10:00:00.000Z',
    accepted_at: overrides.accepted_at,
    ended_at: overrides.ended_at,
    reason: overrides.reason,
    appointment_id: overrides.appointment_id,
  }
}

describe('selectCurrentIncomingCall', () => {
  it('prefers the ringing call tied to the focused appointment', () => {
    const staleCall = makeCall({
      id: 'stale',
      appointment_id: 'apt-stale',
      created_at: '2026-03-26T10:00:00.000Z',
    })
    const focusedCall = makeCall({
      id: 'focused',
      appointment_id: 'apt-focus',
      created_at: '2026-03-26T09:59:00.000Z',
    })

    expect(
      selectCurrentIncomingCall([staleCall, focusedCall], { focusAppointmentId: 'apt-focus' }),
    ).toMatchObject({ id: 'focused' })
  })

  it('falls back to the newest appointment-backed ringing call', () => {
    const olderAppointmentCall = makeCall({
      id: 'older-appointment',
      appointment_id: 'apt-1',
      created_at: '2026-03-26T10:00:00.000Z',
    })
    const newerAppointmentCall = makeCall({
      id: 'newer-appointment',
      appointment_id: 'apt-2',
      created_at: '2026-03-26T10:03:00.000Z',
    })
    const newestLegacyCall = makeCall({
      id: 'legacy',
      appointment_id: undefined,
      created_at: '2026-03-26T10:05:00.000Z',
    })

    expect(
      selectCurrentIncomingCall([olderAppointmentCall, newestLegacyCall, newerAppointmentCall]),
    ).toMatchObject({ id: 'newer-appointment' })
  })

  it('falls back to the newest ringing call when none are appointment-backed', () => {
    const olderCall = makeCall({
      id: 'older',
      appointment_id: undefined,
      created_at: '2026-03-26T10:00:00.000Z',
    })
    const newerCall = makeCall({
      id: 'newer',
      appointment_id: undefined,
      created_at: '2026-03-26T10:04:00.000Z',
    })

    expect(selectCurrentIncomingCall([olderCall, newerCall])).toMatchObject({ id: 'newer' })
  })

  it('ignores non-ringing calls', () => {
    const acceptedCall = makeCall({
      id: 'accepted',
      status: 'accepted',
      appointment_id: 'apt-1',
    })
    const connectedCall = makeCall({
      id: 'connected',
      status: 'connected',
      appointment_id: 'apt-2',
    })

    expect(selectCurrentIncomingCall([acceptedCall, connectedCall])).toBeNull()
  })
})
