/** Pure, shared Memed Android handoff policy. Never authorizes issuance by itself. */
export const MEMED_MOBILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEMED_MOBILE_URL_BASE = 'https://doctor.autamedica.com/doctors/prescriptions/memed-mobile';

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
  status: unknown, startTime: unknown, endTime: unknown, nowMs: number, appointmentType: unknown, 
): boolean {
  if (appointmentType !== 'telemedicine') return false;
  if (status !== 'in_progress' && status !== 'completed') return false;
  if (typeof startTime !== 'string') return false;
  const started = Date.parse(startTime);
  if (!Number.isFinite(started) || started > nowMs + 5 * 60_000 || started < nowMs - 24 * 60 * 60_000) return false;
  if (endTime != null && (typeof endTime !== 'string' || !Number.isFinite(Date.parse(endTime)))) return false;
  return true;
}
export function verifiedBrazilLicense(
  doctor: {active?: boolean; license_type?: string; license_number?: string; uf_brazil?: string; care_country?: string | null},
  licenses: Array<{license_number?: string; uf_brazil?: string; status?: string; cfm_validation_status?: string}>,
): boolean {
  const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '');
  return doctor.active === true && doctor.license_type === 'CRM' &&
    doctor.care_country === 'BR' &&
    /^[A-Z]{2}$/.test(doctor.uf_brazil ?? '') &&
    digits(doctor.license_number).length > 0 &&
    licenses.some(row => row.status === 'active' && row.cfm_validation_status === 'valid' &&
      digits(row.license_number) === digits(doctor.license_number) &&
      row.uf_brazil?.toUpperCase() === doctor.uf_brazil);
}

/**
 * Match the real Memed patient identity validation on the Astro server.
 * Invalid CPF checksums, impossible birth dates and unsupported gender values
 * must fail before Android opens the third-party prescription interface.
 */
export function validBrazilPatientIdentity(cpfInput: unknown, dateInput: unknown, genderInput: unknown, nowMs: number): boolean {
  if (typeof cpfInput !== 'string' || typeof dateInput !== 'string' ||
      typeof genderInput !== 'string') return false;
  const cpf = cpfInput.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(cpf[length])) return false;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return false;
  const date = new Date(dateInput + 'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateInput ||
      date.getUTCFullYear() < 1900 || date.getTime() >= nowMs) return false;
  return /^(male|female|masculino|feminino|m|f)$/.test(genderInput.toLowerCase());
}
