import { describe, expect, it } from 'vitest';
import { validateEventualPatientDetails } from './eventual-patient';

const base = {
  fullName: 'María Demo Paciente',
  documentNumber: '12345678',
  birthDate: '1990-04-12',
  consentAccepted: true,
};

describe('eventual patient identity validation', () => {
  it('accepts valid Argentine DNI and date of birth', () => {
    expect(validateEventualPatientDetails(base, 'AR')).toBeNull();
  });

  it('rejects Argentine documents outside the DNI format', () => {
    expect(validateEventualPatientDetails({ ...base, documentNumber: '123456' }, 'AR'))
      .toBe('eventual_patient_dni_invalid');
  });

  it('accepts a checksum-valid Brazilian CPF and required sex', () => {
    expect(validateEventualPatientDetails({
      ...base, documentNumber: '529.982.247-25', gender: 'female',
    }, 'BR')).toBeNull();
  });

  it.each(['52998224724', '00000000000', '11111111111'])('rejects invalid CPF %s', (documentNumber) => {
    expect(validateEventualPatientDetails({
      ...base, documentNumber, gender: 'male',
    }, 'BR')).toBe('eventual_patient_cpf_invalid');
  });

  it('requires sex for Brazilian Memed patients', () => {
    expect(validateEventualPatientDetails({
      ...base, documentNumber: '52998224725',
    }, 'BR')).toBe('eventual_patient_gender_required');
  });

  it('requires an explicit consent declaration', () => {
    expect(validateEventualPatientDetails({
      ...base, consentAccepted: false,
    }, 'AR')).toBe('eventual_patient_consent_required');
  });

  it('rejects impossible and future birth dates', () => {
    expect(validateEventualPatientDetails({ ...base, birthDate: '2001-02-29' }, 'AR'))
      .toBe('eventual_patient_birth_date_invalid');
    expect(validateEventualPatientDetails({ ...base, birthDate: '2099-01-01' }, 'AR'))
      .toBe('eventual_patient_birth_date_invalid');
  });

  it('validates optional contact without requiring it', () => {
    expect(validateEventualPatientDetails(base, 'AR')).toBeNull();
    expect(validateEventualPatientDetails({ ...base, contact: 'invalid-contact' }, 'AR'))
      .toBe('eventual_patient_contact_invalid');
  });
});
