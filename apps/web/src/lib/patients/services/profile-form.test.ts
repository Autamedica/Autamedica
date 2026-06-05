import { describe, expect, it } from 'vitest';
import {
  buildMissingFields,
  buildProfileCompletion,
  EMPTY_FORM,
  type PatientProfileFormState,
} from './profile-form';

function makeForm(overrides: Partial<PatientProfileFormState>): PatientProfileFormState {
  return {
    ...EMPTY_FORM,
    email: 'paciente@example.com',
    phone: '+5491100000000',
    ...overrides,
  };
}

describe('profile-form official identity requirements', () => {
  it('asks only for the two official identity seed fields before lookup', () => {
    const missing = buildMissingFields(makeForm({}));

    expect(missing.map((field) => field.id)).toEqual([
      'dni',
      'gender',
      'emergencyContactPhone',
    ]);
  });

  it('does not ask for official-source fields as manual pending data', () => {
    const form = makeForm({
      dni: '95466020',
      gender: 'male',
    });
    const missing = buildMissingFields(form);

    expect(missing.map((field) => field.id)).toEqual([
      'officialIdentity',
      'emergencyContactPhone',
    ]);
    expect(missing.map((field) => field.id)).not.toContain('cuil');
    expect(missing.map((field) => field.id)).not.toContain('address');
    expect(missing.map((field) => field.id)).not.toContain('birthDate');
  });

  it('counts official identity as complete when RENAPER data is persisted', () => {
    const form = makeForm({
      dni: '95466020',
      firstName: 'EDUARDO',
      lastName: 'DA ROSA',
      birthDate: '1990-01-01',
      gender: 'male',
      cuil: '20-95466020-9',
      address: 'CABA',
      bloodType: 'O+',
      heightCm: '170',
      weightKg: '72.5',
      emergencyContactPhone: '+5491111111111',
      insuranceInfo: {
        official_data: {
          dni: '95466020',
        },
      },
    });

    expect(buildMissingFields(form)).toEqual([]);
    expect(buildProfileCompletion(form)).toBe(100);
  });

  it('seed-only identity does not count as complete in profile completion', () => {
    const form = makeForm({
      dni: '95466020',
      gender: 'male',
      bloodType: 'O+',
      heightCm: '170',
      weightKg: '72.5',
      emergencyContactPhone: '+5491111111111',
    });

    // 5 of 6 fields complete (identity seed present but no official data)
    expect(buildProfileCompletion(form)).toBe(83);
  });
});
