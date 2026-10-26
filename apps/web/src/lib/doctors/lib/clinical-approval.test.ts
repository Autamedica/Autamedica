import { describe, expect, it } from 'vitest'
import { hasClinicalDoctorApproval } from './clinical-approval'

describe('clinical doctor approval boundary', () => {
  it.each([
    [null, false],
    [{ active: false, license_number: 'CRM-TEST' }, false],
    [{ active: true, license_number: null }, false],
    [{ active: true, license_number: '' }, false],
    [{ active: true, license_number: 'PENDING' }, false],
    [{ active: true, license_number: 'PENDING-123' }, false],
    [{ active: true, license_number: ' pending-abc ' }, false],
    [{ active: true, license_number: 'CRM-TEST-VALIDATED-EXTERNALLY' }, true],
  ] as const)('gates clinician record %j', (record, expected) => {
    expect(hasClinicalDoctorApproval(record)).toBe(expected)
  })
})
