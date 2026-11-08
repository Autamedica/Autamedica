/**
 * Cross-platform RENAPER scope: the caller can ask only for data linked to
 * their authenticated AutaMedica patient row in Argentina.
 *
 * This is an anti-enumeration boundary, NOT proof that the logged-in user
 * physically holds the DNI. SID biometric identity assurance is separate.
 */
export interface PatientRenaperIdentityScope {
  dni: string | null;
  gender: string | null;
  care_country: string | null;
}

function normalizedRegisteredDni(value: string | null): string | null {
  const raw = value?.trim() ?? '';
  if (!raw || /[^0-9.\-\s]/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 6 && digits.length <= 12 ? digits : null;
}

function expectedRenaperSexId(gender: string | null): number | null {
  switch (gender?.trim().toLowerCase()) {
    case 'female': case 'f': case 'femenino': case 'feminino': return 1;
    case 'male': case 'm': case 'masculino': return 2;
    case 'other': case 'x': case 'otro': case 'outro': return 3;
    default: return null;
  }
}

/** No attempt may reach the official provider without a match. */
export function isRenaperLookupInPatientScope(
  patient: PatientRenaperIdentityScope,
  requestedDni: string,
  requestedSexId: number,
): boolean {
  if (patient.care_country !== 'AR') return false;
  const registeredDni = normalizedRegisteredDni(patient.dni);
  return registeredDni !== null &&
    registeredDni === requestedDni &&
    expectedRenaperSexId(patient.gender) === requestedSexId;
}

export function returnedRenaperDocumentMatches(
  requestedDni: string,
  officialDocument: string | null,
): boolean {
  // Official service must send a matching document before persisting/displaying.
  if (!officialDocument) return false;
  return normalizedRegisteredDni(officialDocument) === requestedDni;
}
