/**
 * Only a booking whose immutable creator equals the assigned doctor's
 * authenticated user id may use the doctor-scheduled payment exception.
 *
 * A creator ID different from the patient ID is not sufficient: it would
 * allow arbitrary provenance to bypass the payment gate.
 */
export function isDoctorScheduledAppointment(
  createdBy: string | null | undefined,
  assignedDoctorUserId: string | null | undefined,
): boolean {
  return Boolean(createdBy && assignedDoctorUserId && createdBy === assignedDoctorUserId)
}
