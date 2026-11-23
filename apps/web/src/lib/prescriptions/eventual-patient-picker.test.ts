import { describe, expect, it } from 'vitest';
import {
  formatBrazilCpf,
  getSelectablePatientDisplayName,
  getSelectablePatientSecondaryLabel,
  mapEventualPatientToSelectable,
  matchesSelectablePatientSearch,
  mergePrescriptionPatients,
  type EventualPatientRecord,
  type SelectablePrescriptionPatient,
} from './eventual-patient-picker';

describe('eventual-patient-picker', () => {
  const eventualBr: EventualPatientRecord = {
    patientId: '2b0a93c5-8804-4825-b7db-cbe0d631a340',
    fullName: 'Jaqueline Marques',
    dni: '81103492004',
    documentType: 'CPF',
    birthDate: '1990-05-12',
    gender: 'female',
    contact: 'jaqueline42marques@gmail.com',
  };

  const legacyPlatform: SelectablePrescriptionPatient = {
    id: '8b28b5f0-5a66-40f8-88fb-07f0c45a12e3',
    user_id: 'u-legacy-1',
    dni: '123456789',
    profile: {
      first_name: null,
      last_name: null,
      email: 'jaqueline42marques@gmail.com',
      phone: null,
    },
  };

  it('formats 11-digit Brazilian CPF and keeps non-11-digit values intact', () => {
    expect(formatBrazilCpf('81103492004')).toBe('811.034.920-04');
    expect(formatBrazilCpf('811.034.920-04')).toBe('811.034.920-04');
    expect(formatBrazilCpf('12345678')).toBe('12345678');
  });

  it('maps eventual BR patient with CPF label and email contact', () => {
    const mapped = mapEventualPatientToSelectable(eventualBr);
    expect(mapped).not.toBeNull();
    if (!mapped) throw new Error('expected mapped patient');
    expect(mapped.id).toBe(eventualBr.patientId);
    expect(mapped.isEventual).toBe(true);
    expect(mapped.documentType).toBe('CPF');
    expect(mapped.contact).toBe('jaqueline42marques@gmail.com');
    expect(getSelectablePatientDisplayName(mapped)).toBe('Jaqueline Marques');
    expect(getSelectablePatientSecondaryLabel(mapped)).toBe('CPF 811.034.920-04');
  });

  it('merges eventual patients alongside distinct platform accounts without dropping either', () => {
    const merged = mergePrescriptionPatients([legacyPlatform], [eventualBr]);
    expect(merged).toHaveLength(2);
    expect(merged[0].id).toBe(eventualBr.patientId);
    expect(merged[0].isEventual).toBe(true);
    expect(merged[1].id).toBe(legacyPlatform.id);
    expect(merged[1].isEventual).toBeUndefined();
  });

  it('deduplicates when platform and eventual share the same patientId', () => {
    const duplicatePlatform: SelectablePrescriptionPatient = {
      id: eventualBr.patientId,
      user_id: 'u-1',
      dni: null,
      profile: {
        first_name: 'Jaqueline',
        last_name: 'Marques',
        email: 'jaqueline42marques@gmail.com',
        phone: '+5551999999999',
      },
    };
    const merged = mergePrescriptionPatients([duplicatePlatform], [eventualBr]);
    expect(merged).toHaveLength(1);
    expect(merged[0].isEventual).toBe(true);
    expect(merged[0].documentType).toBe('CPF');
    expect(merged[0].profile?.phone).toBe('+5551999999999');
  });

  it('matches eventual BR patients by name, raw CPF digits, and formatted CPF', () => {
    const mapped = mapEventualPatientToSelectable(eventualBr);
    expect(mapped).not.toBeNull();
    if (!mapped) throw new Error('expected mapped patient');
    expect(matchesSelectablePatientSearch(mapped, 'jaqueline')).toBe(true);
    expect(matchesSelectablePatientSearch(mapped, '81103492004')).toBe(true);
    expect(matchesSelectablePatientSearch(mapped, '811.034.920-04')).toBe(true);
    expect(matchesSelectablePatientSearch(mapped, '811.034')).toBe(true);
    expect(matchesSelectablePatientSearch(mapped, '99999999')).toBe(false);
  });

  it('ignores malformed eventual items without patientId', () => {
    expect(
      mapEventualPatientToSelectable({
        ...eventualBr,
        patientId: '   ',
      }),
    ).toBeNull();
  });
});
