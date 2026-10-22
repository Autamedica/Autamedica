/**
 * Scope triage access granted to doctors who are on duty.
 * Assigned doctors and request owners have separate access checks.
 * Do not use is_on_duty alone: stale doctors must not see clinical records.
 */
export function canOnDutyDoctorTriageRequest(
  requestStatus: string,
  doctorDuty: { is_on_duty: boolean; last_heartbeat_at: string | null } | null,
  nowMs = Date.now(),
): boolean {
  if (requestStatus !== 'searching' || !doctorDuty?.is_on_duty) return false
  if (!doctorDuty.last_heartbeat_at) return false

  const heartbeatMs = Date.parse(doctorDuty.last_heartbeat_at)
  if (!Number.isFinite(heartbeatMs)) return false
  const ageMs = nowMs - heartbeatMs
  return ageMs >= 0 && ageMs <= 90_000
}
