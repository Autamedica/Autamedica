import { describe, expect, it } from 'vitest'
import { buildDoctorLicensePills } from './doctors.adapter'
const doctor = {
  license_type: 'MN', license_number: '123', uf_brazil: 'RS',
  enrollment_jurisdiction: 'Nacional',
  doctor_licenses: [
    { license_type: 'CRM', license_number: '456', uf_brazil: 'RS', status: 'active' },
    { license_type: 'MP', license_number: '789', province: 'Córdoba', status: 'active' },
    { license_type: 'CRO', license_number: '111', uf_brazil: 'SP', status: 'active' },
    { license_type: 'UNKNOWN', license_number: '222', status: 'active' },
    { license_type: 'MN', license_number: '333', status: 'inactive' },
  ],
}
describe('country-specific medical credential labels', () => {
  it('does not turn MN into CRM because an unrelated UF is present', () => {
    const pills = buildDoctorLicensePills(doctor, 'AR')
    expect(pills).toHaveLength(2)
    expect(pills.every(p => p.country === 'AR')).toBe(true)
    expect(pills[0]?.label).toContain('MN 123')
    expect(pills.some(p => /CRM|CRO|222|333/.test(p.label))).toBe(false)
  })
  it('shows only active CRM credentials for BR and never relabels dentistry', () => {
    const pills = buildDoctorLicensePills(doctor, 'BR')
    expect(pills).toHaveLength(1)
    expect(pills[0]?.label).toContain('CRM 456')
  })
  it('does not default unknown credential types to Argentina', () => {
    expect(buildDoctorLicensePills({ ...doctor, license_type: null, doctor_licenses: [] }, 'AR')).toEqual([])
  })
})

