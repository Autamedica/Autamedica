import { validCpf } from './memed-patient';

export interface MemedPilotDoctor {
  id: string;
  active: boolean | null;
  license_type: string | null;
  license_number: string | null;
  uf_brazil: string | null;
  cpf: string | null;
}

export interface MemedPilotLicense {
  license_number: string | null;
  uf_brazil: string | null;
  status: string | null;
  cfm_validation_status: string | null;
  license_type: string | null;
}

export interface MemedPilotProfile {
  first_name: string | null;
  last_name: string | null;
  cpf: string | null;
}

export interface MemedPilotReadiness {
  pilotPresent: boolean;
  activeBrazilianDoctor: boolean;
  cfmLicenseVerified: boolean;
  identityComplete: boolean;
  readyForPilot: boolean;
}

/**
 * Read-only preflight. Do not return doctor's UUID, CPF, CRM, name, or secrets.
 * Readiness permits a controlled clinician-led test; it does not assert that
 * the final PDF is signed or has been delivered to the patient.
 */
export function assessMemedPilotReadiness(input: {
  doctor: MemedPilotDoctor | null;
  licenses: MemedPilotLicense[];
  profile: MemedPilotProfile | null;
  privateCpf: string | null;
}): MemedPilotReadiness {
  const doctor = input.doctor;
  const pilotPresent = Boolean(doctor);
  const activeBrazilianDoctor = Boolean(
    doctor?.active && doctor.license_type === 'CRM' &&
    /^[A-Z]{2}$/.test(doctor.uf_brazil ?? '') && !!doctor.license_number?.trim(),
  );
  const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
  const cfmLicenseVerified = activeBrazilianDoctor && input.licenses.some(license =>
    license.license_type === 'CRM' &&
    license.status === 'active' && license.cfm_validation_status === 'valid' &&
    digits(license.license_number) === digits(doctor?.license_number) &&
    license.uf_brazil?.toUpperCase() === doctor?.uf_brazil?.toUpperCase(),
  );
  const cpf = input.privateCpf || doctor?.cpf || input.profile?.cpf || '';
  const identityComplete = Boolean(
    input.profile?.first_name?.trim() &&
    input.profile?.last_name?.trim() && validCpf(cpf),
  );
  return {
    pilotPresent,
    activeBrazilianDoctor,
    cfmLicenseVerified,
    identityComplete,
    readyForPilot: cfmLicenseVerified && identityComplete,
  };
}
