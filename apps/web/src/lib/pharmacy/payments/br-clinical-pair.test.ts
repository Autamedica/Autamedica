import { describe, expect, it } from 'vitest'
import { isEligibleJordanBrClinicalPair } from './br-clinical-pair'

const patientBr = { active: true, care_country: 'BR' }
const doctorBr = {
  active: true, care_country: 'BR', license_type: 'CRM', license_number: '123456',
}

describe('Jordan BR-only clinical pair at payment boundary', () => {
  it('accepts a BR patient and an active Brazilian CRM physician', () => {
    expect(isEligibleJordanBrClinicalPair(patientBr, doctorBr)).toBe(true)
  })
  it('rejects Argentine patients even if doctor and QR belong to BR', () => {
    expect(isEligibleJordanBrClinicalPair({ ...patientBr, care_country: 'AR' }, doctorBr)).toBe(false)
  })
  it('rejects Argentine doctors even if the patient and payment currency are BR', () => {
    expect(isEligibleJordanBrClinicalPair(patientBr, { ...doctorBr, care_country: 'AR' })).toBe(false)
    expect(isEligibleJordanBrClinicalPair(patientBr, { ...doctorBr, license_type: 'MN' })).toBe(false)
  })
  it('rejects unknown or disabled profiles and provisional registration', () => {
    expect(isEligibleJordanBrClinicalPair(null, doctorBr)).toBe(false)
    expect(isEligibleJordanBrClinicalPair(patientBr, null)).toBe(false)
    expect(isEligibleJordanBrClinicalPair({ ...patientBr, active: false }, doctorBr)).toBe(false)
    expect(isEligibleJordanBrClinicalPair(patientBr, { ...doctorBr, active: false })).toBe(false)
    expect(isEligibleJordanBrClinicalPair(patientBr, { ...doctorBr, care_country: null })).toBe(false)
    expect(isEligibleJordanBrClinicalPair(patientBr, { ...doctorBr, license_number: 'PENDING-CRM' })).toBe(false)
    expect(isEligibleJordanBrClinicalPair(patientBr, { ...doctorBr, license_number: '' })).toBe(false)
  })
})
