/**
 * The Jordan payment contract is limited to BR clinical care: a Brazilian
 * patient profile and an active Brazilian CRM physician.
 *
 * No currency, QR, language, IP address or phone prefix can replace this
 * clinical jurisdiction verification.
 */
export interface BrPatientCandidate {
  active: boolean | null
  care_country: string | null
}

export interface BrPhysicianCandidate {
  active: boolean | null
  care_country: string | null
  license_type: string | null
  license_number: string | null
}

export function isEligibleJordanBrClinicalPair(
  patient: BrPatientCandidate | null | undefined,
  doctor: BrPhysicianCandidate | null | undefined,
): boolean {
  const license = typeof doctor?.license_number === 'string'
    ? doctor.license_number.trim()
    : ''
  return patient?.active === true &&
    patient.care_country === 'BR' &&
    doctor?.active === true &&
    doctor.care_country === 'BR' &&
    doctor.license_type === 'CRM' &&
    license.length > 0 &&
    !/^PENDING/i.test(license)
}
