import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import { assertCountryPair, isCareCountry } from './care-country'

function database(patientCountry: unknown, doctorCountry: unknown, active = true, error: unknown = null) {
  return { from(table: string) {
    const chain = {
      select() { return chain },
      eq() { return chain },
      async maybeSingle() {
        return { data: table === 'patients' ? { care_country: patientCountry }
          : { care_country: doctorCountry, active }, error }
      },
    }
    return chain
  } } as unknown as SupabaseClient<Database>
}
describe('persisted care country authorization', () => {
  it.each(['AR', 'BR'] as const)('allows a matching %s pair', async (country) => {
    await expect(assertCountryPair(database(country, country), 'patient', 'doctor')).resolves.toBe(country)
  })
  it.each([['AR', 'BR'], ['BR', 'AR'], [null, 'BR'], ['AR', null], [undefined, 'AR'], ['UY', 'AR']])(
    'rejects mismatched or missing countries %s / %s', async (patient, doctor) => {
      await expect(assertCountryPair(database(patient, doctor), 'patient', 'doctor')).rejects.toMatchObject({ code: 'CARE_COUNTRY' })
    })
  it('rejects inactive doctors', async () => {
    await expect(assertCountryPair(database('BR', 'BR', false), 'patient', 'doctor')).rejects.toMatchObject({ code: 'CARE_COUNTRY' })
  })
  it('fails closed on lookup errors', async () => {
    await expect(assertCountryPair(database('AR', 'AR', true, new Error('offline')), 'patient', 'doctor')).rejects.toThrow('care_country_lookup_failed')
  })
  it('requires an exact supported country code', () => {
    expect(['AR','BR'].every(isCareCountry)).toBe(true)
    expect(['ar','br','UY','pt-BR','es-AR',null].some(isCareCountry)).toBe(false)
  })
})

