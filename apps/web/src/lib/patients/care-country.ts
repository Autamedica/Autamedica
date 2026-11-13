import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'

export type CareCountry = 'AR' | 'BR'
export function isCareCountry(value: unknown): value is CareCountry {
  return value === 'AR' || value === 'BR'
}

/** Always read the patient's persisted care country; never accept locale as authority. */
export async function assertCountryPair(
  db: SupabaseClient<Database>, patientId: string, doctorId: string,
): Promise<CareCountry> {
  const [patient, doctor] = await Promise.all([
    db.from('patients').select('care_country').eq('id', patientId).maybeSingle(),
    db.from('doctors').select('care_country, active').eq('id', doctorId).maybeSingle(),
  ])
  if (patient.error || doctor.error) throw new Error('care_country_lookup_failed')
  if (!isCareCountry(patient.data?.care_country) || !doctor.data?.active
      || patient.data.care_country !== doctor.data.care_country) {
    throw Object.assign(new Error('care_country_mismatch_or_unset'), { code: 'CARE_COUNTRY' })
  }
  return patient.data.care_country
}

