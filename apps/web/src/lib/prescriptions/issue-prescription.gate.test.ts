import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { issuePrescription, regenerateIssuedPrescriptionPdf } from './issue-prescription.service';

function fakeDb(country: 'AR' | 'BR', patientCountry: 'AR' | 'BR' | null = country) {
  const doctor = {
    id: 'doctor-demo', active: true, care_country: country, license_type: country === 'BR' ? 'CRM' : 'MN',
    uf_brazil: country === 'BR' ? 'RS' : null, license_number: 'DEMO',
    professional_address: 'Test address', refeps_id: 'REFEPS-DEMO',
  };
  const prescription = {
    id: 'rx-demo', doctor_id: 'doctor-demo', patient_id: 'patient-demo',
    status: 'activa', clinical_data: { items: [{ generic_name: 'DEMO MEDICINE' }] },
    cuir: null, country_code: country,
  };
  const profile = { role: 'doctor', active: true, sss_validation_status: 'valid' };
  const patient = { user_id: null, active: true, care_country: patientCountry, dni: '12345678' };
  const responses: Record<string, unknown> = {
    doctors: doctor, prescriptions: prescription, profiles: profile, patients: patient,
  };
  const writes = { insert: vi.fn(), update: vi.fn(), upload: vi.fn(), rpc: vi.fn() };

  const from = vi.fn((table: string) => {
    const chain = {
      select: vi.fn(),
      eq: vi.fn(),
      single: vi.fn(async () => ({ data: responses[table] ?? null, error: null })),
      maybeSingle: vi.fn(async () => ({ data: responses[table] ?? null, error: null })),
      insert: writes.insert,
      update: writes.update,
    };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    return chain;
  });
  const client = { from, rpc: writes.rpc, storage: { from: writes.upload } } as unknown as SupabaseClient;
  return { client, from, writes };
}

describe('official prescription issue denies unverified issuance before any writes', () => {
  it('AR with full patient and prescriber identities cannot issue without explicit homologation', async () => {
    const { client, from, writes } = fakeDb('AR');
    const result = await issuePrescription(client, 'rx-demo', 'user-doctor', {});
    expect(result).toEqual({ ok: false, error: { code: 'ar_production_homologation_required' } });
    expect(from.mock.calls.map((x: string[]) => x[0])).toEqual([
      'doctors', 'prescriptions', 'profiles', 'patients',
    ]);
    expect(writes.insert).not.toHaveBeenCalled();
    expect(writes.update).not.toHaveBeenCalled();
    expect(writes.upload).not.toHaveBeenCalled();
    expect(writes.rpc).not.toHaveBeenCalled();
  });

  it('BR internal PDF path rejects and does not create a fake RCTA/CUIR', async () => {
    const { client, writes } = fakeDb('BR');
    const result = await issuePrescription(client, 'rx-demo', 'user-doctor',
      { AR_RX_PRODUCTION_APPROVED: 'true' });
    expect(result).toEqual({ ok: false, error: { code: 'br_requires_memed_provider' } });
    expect(writes.insert).not.toHaveBeenCalled();
    expect(writes.update).not.toHaveBeenCalled();
    expect(writes.rpc).not.toHaveBeenCalled();
  });

  it('never overwrites an issued signed PDF with an unsigned regenerated PDF', async () => {
    const { client, from, writes } = fakeDb('AR');
    const result = await regenerateIssuedPrescriptionPdf(client, 'rx-demo', 'user-doctor');
    expect(result).toEqual({
      ok: false, error: { code: 'reissue_requires_verified_signature' },
    });
    expect(from).not.toHaveBeenCalled();
    expect(writes.update).not.toHaveBeenCalled();
    expect(writes.upload).not.toHaveBeenCalled();
  });

  it('mismatched patient country fails even if production flag were enabled', async () => {
    const { client, writes } = fakeDb('AR', 'BR');
    const result = await issuePrescription(client, 'rx-demo', 'user-doctor',
      { AR_RX_PRODUCTION_APPROVED: 'true' });
    expect(result).toEqual({ ok: false, error: { code: 'patient_country_required_or_mismatched' } });
    expect(writes.insert).not.toHaveBeenCalled();
    expect(writes.update).not.toHaveBeenCalled();
  });
});
