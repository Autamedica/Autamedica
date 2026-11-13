/**
 * Server-side clinical issuance gate.
 * Saving a draft is NOT equivalent to an officially issued prescription.
 * This gate must run before any vendor, PDF, CUIR, audit or storage mutation.
 */
export type IssuanceGateCode =
  | 'doctor_not_found'
  | 'prescriber_validation_required'
  | 'patient_not_found'
  | 'prescription_country_required'
  | 'doctor_country_mismatch'
  | 'patient_country_required_or_mismatched'
  | 'br_requires_memed_provider'
  | 'ar_production_homologation_required';

export type IssuanceCountry = 'AR' | 'BR';

export function checkDirectPrescriptionIssuance(input: {
  doctorActive: boolean | null | undefined;
  profileActive: boolean | null | undefined;
  profileRole: string | null | undefined;
  patientActive: boolean | null | undefined;
  prescriptionCountry: string | null | undefined;
  doctorCountry: string | null | undefined;
  patientCountry: string | null | undefined;
  argentinaProductionApproved: boolean;
}): { ok: true; country: 'AR' } | { ok: false; code: IssuanceGateCode } {
  if (input.doctorActive !== true) {
    return { ok: false, code: 'doctor_not_found' };
  }
  if (input.profileActive !== true || input.profileRole !== 'doctor') {
    return { ok: false, code: 'prescriber_validation_required' };
  }
  if (input.patientActive !== true) {
    return { ok: false, code: 'patient_not_found' };
  }

  const country = input.prescriptionCountry;
  if (country !== 'AR' && country !== 'BR') {
    return { ok: false, code: 'prescription_country_required' };
  }
  if (input.doctorCountry !== country) {
    return { ok: false, code: 'doctor_country_mismatch' };
  }
  if (input.patientCountry !== country) {
    return { ok: false, code: 'patient_country_required_or_mismatched' };
  }

  // The native/internal Brazilian PDF is not the Memed issuer.
  // BR issuance must use its own verified Memed route and callback.
  if (country === 'BR') {
    return { ok: false, code: 'br_requires_memed_provider' };
  }

  // Must be explicitly enabled only after signed PDF, Farmalink production
  // registration, identity and country-specific clinical E2E are evidenced.
  if (!input.argentinaProductionApproved) {
    return { ok: false, code: 'ar_production_homologation_required' };
  }
  return { ok: true, country: 'AR' };
}

export function hasEligibleProfessionalPadesCertificate(
  certificate: {
    acProvider: string;
    signatureMethod: string;
    certValidUntil: string;
  } | null,
  nowMs: number = Date.now(),
): boolean {
  if (!certificate?.acProvider ||
      certificate.acProvider === 'self_signed' ||
      certificate.signatureMethod !== 'ac_external') return false;
  const expiresAt = Date.parse(certificate.certValidUntil);
  return Number.isFinite(expiresAt) && expiresAt > nowMs;
}
