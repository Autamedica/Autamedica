import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveMemedPatient, validBirthDate, validCpf } from './memed-patient';

const patientId = '11111111-1111-4111-8111-111111111111';
const identity = { care_country: 'BR', user_id: 'synthetic-user', active: true, cpf: '52998224725',
  birth_date: '2000-02-29', gender: 'female', lgpd_consent: true };

function database(overrides: Record<string, unknown> = {}): SupabaseClient {
  const rows: Record<string, unknown> = { patient_care_team: { id: 'synthetic-team' },
    appointments: null, pharmacy_dispatch_requests: null, patient_private_identities: null,
    patients: identity, profiles: { first_name: 'Synthetic', last_name: 'Patient' }, ...overrides };
  return { from: vi.fn((table: string) => {
    const chain = { select: vi.fn(), update: vi.fn(), eq: vi.fn(), is: vi.fn(), or: vi.fn(), in: vi.fn(), gte: vi.fn(), order: vi.fn(), limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })) };
    chain.is.mockReturnValue(chain); chain.or.mockReturnValue(chain); chain.in.mockReturnValue(chain); chain.gte.mockReturnValue(chain);
    chain.select.mockReturnValue(chain); chain.update.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.order.mockReturnValue(chain); chain.limit.mockReturnValue(chain);
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
  it('accepts a completed pharmacy dispatch assigned to the doctor without an appointment', async () => {
    await expect(resolveMemedPatient(database({
      patient_care_team: null,
      appointments: null,
      pharmacy_dispatch_requests: { id: 'dispatch' },
    }), 'doctor', patientId)).resolves.toHaveProperty('cpf', identity.cpf);
  });
  it('resolves an isolated QR guest from the active dispatch identity and consent', async () => {
    const dispatch = {
      id: 'synthetic-dispatch',
      patient_name: 'Synthetic Guest',
      patient_cpf: '529.982.247-25',
      patient_phone: '+55 51 99999-1111',
      lgpd_consent: true,
    };
    const result = await resolveMemedPatient(database({
      patient_care_team: null,
      appointments: null,
      pharmacy_dispatch_requests: dispatch,
      patients: { ...identity, user_id: null, cpf: null, birth_date: null, gender: null },
    }), 'doctor', patientId);
    expect(result).toEqual({
      idExterno: `autamedica-${patientId}`,
      nome: 'Synthetic Guest',
      cpf: '52998224725',
      telefone: '+5551999991111',
    });
  });

  it('resolves a doctor-created eventual patient from private identity and consent', async () => {
    const result = await resolveMemedPatient(database({
      patient_care_team: { id: 'synthetic-team' },
      patients: { ...identity, user_id: null, cpf: null },
      patient_private_identities: {
        full_name: 'Eventual Synthetic Patient',
        document_type: 'CPF',
        document_number: '52998224725',
        birth_date: '1991-08-19',
        gender: 'female',
        phone: '+55 51 99999-2222',
        consent_at: '2026-11-20T00:00:00.000Z',
        consent_scope: 'prescription_issuance_and_delivery',
      },
    }), 'doctor', patientId);
    expect(result).toEqual({
      idExterno: `autamedica-${patientId}`,
      nome: 'Eventual Synthetic Patient',
      cpf: '52998224725',
      telefone: '+5551999992222',
      data_nascimento: '19/08/1991',
      sexo: 'Feminino',
    });
  });

  it('uses the doctor-scoped private identity when an authorized registered chart is reused', async () => {
    const result = await resolveMemedPatient(database({
      patients: { ...identity, cpf: null },
      patient_private_identities: {
        full_name: 'Registered Synthetic Patient',
        document_type: 'CPF',
        document_number: '52998224725',
        birth_date: '1988-03-04',
        gender: 'male',
        phone: '+55 51 98888-3333',
        consent_at: '2026-11-20T00:00:00.000Z',
        consent_scope: 'prescription_issuance_and_delivery',
      },
    }), 'doctor', patientId);
    expect(result).toMatchObject({
      nome: 'Registered Synthetic Patient',
      cpf: '52998224725',
      telefone: '+5551988883333',
      data_nascimento: '04/03/1988',
      sexo: 'Masculino',
    });
  });

  it('rejects eventual identities without issuance and delivery consent', async () => {
    await expect(resolveMemedPatient(database({
      patient_care_team: { id: 'synthetic-team' },
      patients: { ...identity, user_id: null, cpf: null },
      patient_private_identities: {
        full_name: 'Eventual Synthetic Patient',
        document_type: 'CPF',
        document_number: '52998224725',
        birth_date: '1991-08-19',
        gender: 'female',
        phone: null,
        consent_at: null,
        consent_scope: 'prescription_issuance_and_delivery',
      },
    }), 'doctor', patientId)).rejects.toThrow('memed_patient_consent_required');
  });

  it('rejects QR guest dispatches without recorded LGPD consent', async () => {
    await expect(resolveMemedPatient(database({
      patient_care_team: null,
      appointments: null,
      pharmacy_dispatch_requests: {
        id: 'synthetic-dispatch', patient_name: 'Synthetic Guest',
        patient_cpf: '52998224725', patient_phone: '+55 51 99999-1111', lgpd_consent: false,
      },
      patients: { ...identity, user_id: null, cpf: null },
    }), 'doctor', patientId)).rejects.toThrow('memed_patient_consent_required');
  });

  it('rejects invalid CPF in the QR dispatch identity', async () => {
    await expect(resolveMemedPatient(database({
      patient_care_team: null,
      appointments: null,
      pharmacy_dispatch_requests: {
        id: 'synthetic-dispatch', patient_name: 'Synthetic Guest',
        patient_cpf: '52998224724', patient_phone: '+55 51 99999-1111', lgpd_consent: true,
      },
      patients: { ...identity, user_id: null, cpf: null },
    }), 'doctor', patientId)).rejects.toThrow('memed_patient_identity_incomplete');
  });

  it('accepts a legitimate completed consultation', async () => {
    await expect(resolveMemedPatient(database({ patient_care_team: null, appointments: { id: 'visit' } }),
      'doctor', patientId)).resolves.toHaveProperty('cpf', identity.cpf);
  });
  it('accepts clinician-confirmed demographics for express patients', async () => {
    await expect(resolveMemedPatient(database({ patients: { ...identity, birth_date: null, gender: null } }),
      'doctor', patientId, { birthDate: '2000-02-29', gender: 'female' }))
      .resolves.toHaveProperty('cpf', identity.cpf);
  });
  it('rejects invalid clinician-entered demographics', async () => {
    await expect(resolveMemedPatient(database(), 'doctor', patientId,
      { birthDate: '2099-01-01', gender: 'female' }))
      .rejects.toThrow('memed_patient_demographics_invalid');
  });
  it('accepts clinician-confirmed demographics for express patients', async () => {
    await expect(resolveMemedPatient(database({ patients: { ...identity, birth_date: null, gender: null } }),
      'doctor', patientId, { birthDate: '2000-02-29', gender: 'female' }))
      .resolves.toHaveProperty('cpf', identity.cpf);
  });
  it('rejects invalid clinician-entered demographics', async () => {
    await expect(resolveMemedPatient(database(), 'doctor', patientId,
      { birthDate: '2099-01-01', gender: 'female' }))
      .rejects.toThrow('memed_patient_demographics_invalid');
  });
  it.each([{ lgpd_consent: false }, { active: false }])('requires authorized active patient %j', async (change) => {
    await expect(resolveMemedPatient(database({ patients: { ...identity, ...change } }), 'doctor', patientId))
      .rejects.toThrow('memed_patient_consent_required');
  });
  it.each([{ cpf: '00000000000' }, { cpf: '' }])('rejects incomplete required identity %j', async (change) => {
    await expect(resolveMemedPatient(database({ patients: { ...identity, ...change } }), 'doctor', patientId))
      .rejects.toThrow('memed_patient_identity_incomplete');
  });
  it.each([{ birth_date: null }, { gender: null }, { birth_date: null, gender: null }])(
    'accepts express pharmacy patients without optional demographics %j', async (change) => {
      const patient = await resolveMemedPatient(database({ patients: { ...identity, ...change } }), 'doctor', patientId);
      expect(patient).toMatchObject({ nome: 'Synthetic Patient', cpf: identity.cpf });
      if (change.birth_date === null) expect(patient).not.toHaveProperty('data_nascimento');
      else expect(patient).toHaveProperty('data_nascimento');
      if (change.gender === null) expect(patient).not.toHaveProperty('sexo');
      else expect(patient).toHaveProperty('sexo');
    },
  );
  it('omits malformed optional demographics instead of fabricating them', async () => {
    const patient = await resolveMemedPatient(database({ patients: { ...identity, birth_date: 'bad', gender: 'unknown' } }), 'doctor', patientId);
    expect(patient).not.toHaveProperty('data_nascimento');
    expect(patient).not.toHaveProperty('sexo');
  });
  it('rejects manipulated patient identifiers', async () => {
    await expect(resolveMemedPatient(database(), 'doctor', '../../other')).rejects.toThrow('memed_patient_required');
  });
});

