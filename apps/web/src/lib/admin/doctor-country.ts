export type DoctorCountry = 'AR' | 'BR' | 'UNKNOWN';

export interface DoctorCountryLicense {
  license_type?: string | null;
  license_jurisdiction?: string | null;
  uf_brazil?: string | null;
  province?: string | null;
}

export interface DoctorCountrySource {
  care_country?: string | null;
  license_type?: string | null;
  uf_brazil?: string | null;
  enrollment_jurisdiction?: string | null;
  doctor_licenses?: DoctorCountryLicense[] | null;
}

const BRAZILIAN_UFS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
]);

function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toUpperCase();
}

function countryFromLabel(value: string | null | undefined): DoctorCountry | null {
  const label = normalize(value);
  if (['AR', 'ARG', 'ARGENTINA', 'ARGENTINE'].includes(label)) return 'AR';
  if (['BR', 'BRA', 'BRAZIL', 'BRASIL'].includes(label)) return 'BR';
  return null;
}

/**
 * Determines the clinical market for the admin directory.
 * Explicit care_country wins; legacy rows fall back to their professional
 * license type/jurisdiction. Ambiguous records are kept visible as UNKNOWN.
 */
export function getDoctorCountry(doctor: DoctorCountrySource): DoctorCountry {
  const explicitCountry = countryFromLabel(doctor.care_country);
  if (explicitCountry) return explicitCountry;

  const licenses = doctor.doctor_licenses ?? [];
  const jurisdictions = [
    doctor.enrollment_jurisdiction,
    ...licenses.map((license) => license.license_jurisdiction),
  ];

  for (const jurisdiction of jurisdictions) {
    const country = countryFromLabel(jurisdiction);
    if (country) return country;

    if (BRAZILIAN_UFS.has(normalize(jurisdiction))) return 'BR';
  }

  const licenseTypes = [
    doctor.license_type,
    ...licenses.map((license) => license.license_type),
  ].map(normalize);

  if (licenseTypes.includes('CRM')) return 'BR';
  if (licenseTypes.some((type) => type === 'MN' || type === 'MP')) return 'AR';

  const brazilUf = normalize(doctor.uf_brazil)
    || licenses.map((license) => normalize(license.uf_brazil)).find(Boolean)
    || '';
  if (BRAZILIAN_UFS.has(brazilUf)) return 'BR';

  return 'UNKNOWN';
}
