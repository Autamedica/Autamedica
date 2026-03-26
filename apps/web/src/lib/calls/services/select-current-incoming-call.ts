import type { Call } from '@autamedica/telemedicine'

interface SelectCurrentIncomingCallOptions {
  focusAppointmentId?: string | null
}

function sortByNewest(first: Pick<Call, 'created_at' | 'id'>, second: Pick<Call, 'created_at' | 'id'>): number {
  const createdAtDiff =
    new Date(second.created_at).getTime() - new Date(first.created_at).getTime()

  if (createdAtDiff !== 0) {
    return createdAtDiff
  }

  return second.id.localeCompare(first.id)
}

function pickNewest(calls: Call[]): Call | null {
  if (calls.length === 0) {
    return null
  }

  return [...calls].sort(sortByNewest)[0] ?? null
}

export function selectCurrentIncomingCall(
  calls: Call[],
  options: SelectCurrentIncomingCallOptions = {},
): Call | null {
  const normalizedFocusAppointmentId = options.focusAppointmentId?.trim() || null
  const ringingCalls = calls.filter((call) => call.status === 'ringing')

  if (ringingCalls.length === 0) {
    return null
  }

  if (normalizedFocusAppointmentId) {
    const focusedCall = pickNewest(
      ringingCalls.filter((call) => call.appointment_id === normalizedFocusAppointmentId),
    )

    if (focusedCall) {
      return focusedCall
    }
  }

  const appointmentBackedCall = pickNewest(
    ringingCalls.filter((call) => typeof call.appointment_id === 'string' && call.appointment_id.length > 0),
  )

  if (appointmentBackedCall) {
    return appointmentBackedCall
  }

  return pickNewest(ringingCalls)
}
