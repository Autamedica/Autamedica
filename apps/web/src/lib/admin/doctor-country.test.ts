import { describe, expect, it } from 'vitest';
import { getDoctorCountry } from './doctor-country';

describe('getDoctorCountry', () => {
  it('prioritizes the explicit care country over legacy license metadata', () => {
    expect(getDoctorCountry({ care_country: 'AR', license_type: 'CRM' })).toBe('AR');
    expect(getDoctorCountry({ care_country: 'Brasil', license_type: 'MN' })).toBe('BR');
  });

  it('classifies legacy Argentine doctors by national or provincial license type', () => {
    expect(getDoctorCountry({ license_type: 'MN' })).toBe('AR');
    expect(getDoctorCountry({ doctor_licenses: [{ license_type: 'MP' }] })).toBe('AR');
  });

  it('classifies Brazilian doctors by CRM, jurisdiction or UF', () => {
    expect(getDoctorCountry({ license_type: 'CRM' })).toBe('BR');
    expect(getDoctorCountry({ doctor_licenses: [{ license_jurisdiction: 'BR' }] })).toBe('BR');
    expect(getDoctorCountry({ doctor_licenses: [{ uf_brazil: 'RS' }] })).toBe('BR');
  });

  it('keeps records with no reliable country signal visible as unknown', () => {
    expect(getDoctorCountry({})).toBe('UNKNOWN');
    expect(getDoctorCountry({ enrollment_jurisdiction: 'Desconocida' })).toBe('UNKNOWN');
  });
});
