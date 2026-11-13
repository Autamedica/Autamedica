/**
 * CID-10 disclosure for Brazilian medical certificates.
 *
 * Never disclose a clinical diagnosis merely because an employer requests it.
 * CFM 2.381/2024 art. 5, §§3-4: patient request/concordance must be
 * explicit in the certificate and registered in the clinical record.
 */
export interface BrazilianCidDisclosureInput {
  countryCode: 'BR' | 'AR';
  code?: string | null;
  patientRequested: boolean;
  doctorLicenseType?: string | null;
  doctorUfBrazil?: string | null;
}

export function resolveBrazilianCidDisclosure(input: BrazilianCidDisclosureInput): string | null {
  const raw = (input.code ?? '').trim().toUpperCase();
  if (input.countryCode !== 'BR') {
    if (raw || input.patientRequested) throw new Error('cid10_brazil_only');
    return null;
  }
  if (input.doctorLicenseType !== 'CRM' || !/^[A-Z]{2}$/.test(input.doctorUfBrazil ?? '')) {
    throw new Error('cid10_brazilian_doctor_required');
  }
  if (!raw) {
    if (input.patientRequested) throw new Error('cid10_code_required_when_requested');
    return null;
  }
  if (!/^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,2})?$/.test(raw)) {
    throw new Error('cid10_code_invalid');
  }
  if (!input.patientRequested) throw new Error('cid10_patient_request_required');
  return raw;
}
