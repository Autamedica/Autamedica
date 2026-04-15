type AppointmentWindowLike = {
  start_time?: string | null
  end_time?: string | null
  duration_minutes?: number | null
}

export const EARLY_JOIN_WINDOW_MS = 45 * 60 * 1000
export const LATE_JOIN_GRACE_MS = 24 * 60 * 60 * 1000

export function getAppointmentWindowStartMs(appointment: AppointmentWindowLike): number | null {
  const iso = appointment.start_time
  if (!iso) return null

  const parsed = Date.parse(iso)
  return Number.isNaN(parsed) ? null : parsed
}

export function getAppointmentWindowEndMs(appointment: AppointmentWindowLike): number | null {
  if (appointment.end_time) {
    const parsedEnd = Date.parse(appointment.end_time)
    if (!Number.isNaN(parsedEnd)) {
      return parsedEnd
    }
  }

  const startMs = getAppointmentWindowStartMs(appointment)
  if (startMs === null) return null

  const durationMinutes = appointment.duration_minutes ?? 30
  return startMs + durationMinutes * 60 * 1000
}

export function isTelemedicineCallWindowOpen(
  appointment: AppointmentWindowLike,
  nowMs = Date.now(),
): boolean {
  const startMs = getAppointmentWindowStartMs(appointment)
  const endMs = getAppointmentWindowEndMs(appointment)

  if (startMs === null || endMs === null) {
    return false
  }

  return nowMs >= startMs - EARLY_JOIN_WINDOW_MS && nowMs <= endMs + LATE_JOIN_GRACE_MS
}
