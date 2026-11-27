/** Pure, shared Memed Android handoff policy. Never authorizes issuance by itself. */
export const MEMED_MOBILE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MEMED_MOBILE_URL_BASE = 'https://doctor.autamedica.com/doctors/prescriptions/memed-mobile';

/** Legacy Memed RX settings remain valid while mobile-specific settings roll out. */
export function memedMobileFeatureEnabled(mobileEnabled: string | undefined, rxEnabled: string | undefined): boolean {
  return mobileEnabled === 'true' && rxEnabled === 'true';
}

export function resolveMemedMobilePilotDoctorId(mobilePilotId: string | undefined, legacyPilotId: string | undefined): string | null {
  const mobileId = mobilePilotId?.trim();
  const legacyId = legacyPilotId?.trim();
  return mobileId || legacyId || null;
}

/**
 * Pilot allowlist is strictly optional: when unset or blank, any active,
 * CFM-verified Brazilian CRM doctor is eligible (enforced by verifiedBrazilLicense).
 */
export function isMemedMobilePilotDoctorAllowed(
  doctorId: string | null | undefined,
  mobilePilotId: string | undefined,
  legacyPilotId: string | undefined,
): boolean {
  if (!doctorId) return false;
  const configuredIds = [mobilePilotId, legacyPilotId]
    .filter((value): value is string => typeof value === 'string')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return configuredIds.length === 0 || configuredIds.includes(doctorId);
}

export function validMemedMobileAppointment(input: unknown): input is string {
  return typeof input === 'string' && MEMED_MOBILE_UUID.test(input);
}
export function buildMemedMobileLaunchUrl(
  encounterId: string,
  queryKey: 'appointmentId' | 'requestId' | 'patientId' = 'appointmentId',
): string {
  if (!validMemedMobileAppointment(encounterId)) throw new Error('INVALID_ENCOUNTER_ID');
  if (queryKey !== 'appointmentId' && queryKey !== 'requestId' && queryKey !== 'patientId') {
    throw new Error('INVALID_ENCOUNTER_TYPE');
  }
  const url = new URL(MEMED_MOBILE_URL_BASE);
  url.searchParams.set(queryKey, encounterId);
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
 * Invalid CPF checksums fail before Android opens the third-party prescription
 * interface. DOB and gender are optional Memed attributes and are validated when supplied.
 */
export function validBrazilPatientIdentity(cpfInput: unknown, dateInput: unknown, genderInput: unknown, nowMs: number): boolean {
  if (typeof cpfInput !== 'string') return false;
  const cpf = cpfInput.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(cpf[length])) return false;
  }
  // Memed accepts DOB and gender as optional patient attributes. Validate them
  // when supplied, but do not veto an otherwise identified, consented patient.
  if (dateInput != null && dateInput !== '') {
    if (typeof dateInput !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) return false;
    const date = new Date(dateInput + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateInput ||
        date.getUTCFullYear() < 1900 || date.getTime() >= nowMs) return false;
  }
  if (genderInput != null && genderInput !== '' &&
      (typeof genderInput !== 'string' || !/^(male|female|masculino|feminino|m|f)$/i.test(genderInput))) return false;
  return true;
}
