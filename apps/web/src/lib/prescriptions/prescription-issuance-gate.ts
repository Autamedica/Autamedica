/**
 * Server-side clinical issuance gate.
 * Saving a draft is NOT equivalent to an officially issued prescription.
 * This gate must run before any vendor, PDF, CUIR, audit or storage mutation.
 */
export type IssuanceGateCode =
  | 'prescription_country_required'
  | 'doctor_country_mismatch'
  | 'patient_country_required_or_mismatched'
  | 'ar_production_homologation_required';

export type IssuanceCountry = 'AR' | 'BR';

export function checkDirectPrescriptionIssuance(input: {
  prescriptionCountry: string | null | undefined;
  doctorCountry: string | null | undefined;
  patientCountry: string | null | undefined;
  argentinaProductionApproved: boolean;
}): { ok: true; country: IssuanceCountry } | { ok: false; code: IssuanceGateCode } {
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

  // Brazil uses its independent CFM/CRM path. It never invokes RCTA or Farmalink.
  // Argentina remains gated on its production Farmalink homologation.
  if (country === 'AR' && !input.argentinaProductionApproved) {
    return { ok: false, code: 'ar_production_homologation_required' };
  }
  return { ok: true, country };
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
