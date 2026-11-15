/**
 * Prescriptions are routed by the primary credential's canonical country,
 * not by the browser, a mutable document field, or patient nationality.
 *
 * AR -> Farmalink when homologated and enabled; BR -> Memed's dedicated API.
 * This is a country/ownership guard, not proof of provider activation.
 */
export type PrescriptionMarket = 'AR' | 'BR';
export type ExternalPrescriptionProvider = 'farmalink' | 'memed';

export interface PrescriptionProviderRoute {
  country: PrescriptionMarket;
  provider: ExternalPrescriptionProvider;
}

export function resolvePrescriptionProviderRoute(
  doctorCareCountry: unknown,
  documentCountry: unknown,
  patientCareCountry: unknown,
): PrescriptionProviderRoute | null {
  if (doctorCareCountry !== 'AR' && doctorCareCountry !== 'BR') return null;
  if (documentCountry !== doctorCareCountry || patientCareCountry !== doctorCareCountry) return null;

  return doctorCareCountry === 'AR'
    ? { country: 'AR', provider: 'farmalink' }
    : { country: 'BR', provider: 'memed' };
}
