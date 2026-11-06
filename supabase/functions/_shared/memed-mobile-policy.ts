/** Pure, shared Memed Android handoff policy. Never authorizes issuance by itself. */
export const MEMED_MOBILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEMED_MOBILE_URL_BASE = 'https://www.autamedica.com/doctors/prescriptions/memed-mobile';

export function validMemedMobileAppointment(input: unknown): input is string {
  return typeof input === 'string' && MEMED_MOBILE_UUID.test(input);
}
export function buildMemedMobileLaunchUrl(appointmentId: string): string {
  if (!validMemedMobileAppointment(appointmentId)) throw new Error('INVALID_APPOINTMENT_ID');
  const url = new URL(MEMED_MOBILE_URL_BASE);
  url.searchParams.set('appointmentId', appointmentId);
  return url.toString();
}
export function appointmentPermitsPrescription(
  status: unknown, startTime: unknown, endTime: unknown, nowMs: number,
): boolean {
  if (status !== 'in_progress' && status !== 'completed') return false;
  if (typeof startTime !== 'string') return false;
  const started = Date.parse(startTime);
  if (!Number.isFinite(started) || started > nowMs + 5 * 60_000 || started < nowMs - 24 * 60 * 60_000) return false;
  if (endTime != null && (typeof endTime !== 'string' || !Number.isFinite(Date.parse(endTime)))) return false;
  return true;
}
export function verifiedBrazilLicense(
  doctor: {active?: boolean; license_type?: string; license_number?: string; uf_brazil?: string},
  licenses: Array<{license_number?: string; uf_brazil?: string; status?: string; cfm_validation_status?: string}>,
): boolean {
  const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
  return doctor.active === true && doctor.license_type === 'CRM' &&
    /^[A-Z]{2}$/.test(doctor.uf_brazil ?? '') &&
    digits(doctor.license_number).length > 0 &&
    licenses.some(row => row.status === 'active' && row.cfm_validation_status === 'valid' &&
      digits(row.license_number) === digits(doctor.license_number) &&
      row.uf_brazil?.toUpperCase() === doctor.uf_brazil);
}
