import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveMemedPatient, validBirthDate, validCpf } from './memed-patient';

const patientId = '11111111-1111-4111-8111-111111111111';
const identity = { care_country: 'BR', user_id: 'synthetic-user', active: true, cpf: '52998224725',
  birth_date: '2000-02-29', gender: 'female', lgpd_consent: true };

function database(overrides: Record<string, unknown> = {}): SupabaseClient {
  const rows: Record<string, unknown> = { patient_care_team: { id: 'synthetic-team' },
    appointments: null, patients: identity,
    profiles: { first_name: 'Synthetic', last_name: 'Patient' }, ...overrides };
  return { from: vi.fn((table: string) => {
    const chain = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), or: vi.fn(), limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })) };
    chain.is.mockReturnValue(chain); chain.or.mockReturnValue(chain);
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.limit.mockReturnValue(chain);
    return chain;
  }) } as unknown as SupabaseClient;
}

describe('Memed patient authorization', () => {
  it.each(['AR', null, undefined])('rejects a patient outside the BR care market: %s', async (care_country) => {
    await expect(resolveMemedPatient(database({ patients: { ...identity, care_country } }), 'doctor', patientId))
      .rejects.toThrow('memed_patient_country_required');
  });
  it.each(['00000000000', '11111111111', '52998224724', '', '123'])('rejects invalid CPF %s', (cpf) => {
    expect(validCpf(cpf)).toBe(false);
  });
  it('validates both CPF check digits', () => expect(validCpf('529.982.247-25')).toBe(true));
  it.each(['2001-02-29', '2000-13-01', '2099-01-01', '', '01/01/2000'])('rejects invalid DOB %s', (date) => {
    expect(validBirthDate(date)).toBe(false);
  });
  it('returns backend identity and stable external id', async () => {
    const result = await resolveMemedPatient(database(), 'doctor', patientId);
    expect(result).toEqual({ idExterno: `autamedica-${patientId}`, nome: 'Synthetic Patient',
      cpf: identity.cpf, data_nascimento: '29/02/2000', sexo: 'Feminino' });
  });
  it('rejects unauthorized patients before reading their identity', async () => {
    const db = database({ patient_care_team: null });
    await expect(resolveMemedPatient(db, 'doctor', patientId)).rejects.toThrow('doctor_patient_access_required');
    expect(db.from).not.toHaveBeenCalledWith('patients');
  });
  it('accepts a legitimate completed consultation', async () => {
    await expect(resolveMemedPatient(database({ patient_care_team: null, appointments: { id: 'visit' } }),
      'doctor', patientId)).resolves.toHaveProperty('cpf', identity.cpf);
  });
  it.each([{ lgpd_consent: false }, { active: false }])('requires authorized active patient %j', async (change) => {
    await expect(resolveMemedPatient(database({ patients: { ...identity, ...change } }), 'doctor', patientId))
      .rejects.toThrow('memed_patient_consent_required');
  });
  it.each([{ cpf: '00000000000' }, { birth_date: null }, { gender: null }])('rejects incomplete identity %j', async (change) => {
    await expect(resolveMemedPatient(database({ patients: { ...identity, ...change } }), 'doctor', patientId))
      .rejects.toThrow('memed_patient_identity_incomplete');
  });
  it('rejects manipulated patient identifiers', async () => {
    await expect(resolveMemedPatient(database(), 'doctor', '../../other')).rejects.toThrow('memed_patient_required');
  });
});

