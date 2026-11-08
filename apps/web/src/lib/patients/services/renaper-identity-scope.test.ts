import { describe, expect, it } from 'vitest';
import {
  isRenaperLookupInPatientScope,
  returnedRenaperDocumentMatches,
  type PatientRenaperIdentityScope,
} from './renaper-identity-scope';

const PATIENT: PatientRenaperIdentityScope = {
  care_country: 'AR',
  dni: '12.345.678',
  gender: 'female',
};

describe('RENAPER patient scope (synthetic fixtures)', () => {
  it('accepts only the authenticated AR row DNI + sex', () => {
    expect(isRenaperLookupInPatientScope(PATIENT, '12345678', 1)).toBe(true);
  });

  it('denies attempts to query a different person', () => {
    expect(isRenaperLookupInPatientScope(PATIENT, '87654321', 1)).toBe(false);
  });

  it('denies Brazil, missing country and missing registered DNI', () => {
    expect(isRenaperLookupInPatientScope({ ...PATIENT, care_country: 'BR' }, '12345678', 1)).toBe(false);
    expect(isRenaperLookupInPatientScope({ ...PATIENT, care_country: null }, '12345678', 1)).toBe(false);
    expect(isRenaperLookupInPatientScope({ ...PATIENT, dni: null }, '12345678', 1)).toBe(false);
  });

  it('denies wrong or missing registered sex', () => {
    expect(isRenaperLookupInPatientScope(PATIENT, '12345678', 2)).toBe(false);
    expect(isRenaperLookupInPatientScope({ ...PATIENT, gender: null }, '12345678', 1)).toBe(false);
  });

  it('does not accept a contaminated or invalid registered DNI', () => {
    expect(isRenaperLookupInPatientScope({ ...PATIENT, dni: 'X12345678' }, '12345678', 1)).toBe(false);
    expect(isRenaperLookupInPatientScope({ ...PATIENT, dni: '12' }, '12', 1)).toBe(false);
  });

  it('fails closed when official response has a missing/different DNI', () => {
    expect(returnedRenaperDocumentMatches('12345678', null)).toBe(false);
    expect(returnedRenaperDocumentMatches('12345678', '87654321')).toBe(false);
    expect(returnedRenaperDocumentMatches('12345678', '12.345.678')).toBe(true);
  });
});
