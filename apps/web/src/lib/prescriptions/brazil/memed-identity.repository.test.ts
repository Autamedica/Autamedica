import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { getMemedDoctorCpf, storeMemedDoctorCpf } from './memed-identity.repository';

function database(cpf: string | null, error: unknown = null) {
  const upsert = vi.fn(async () => ({ error }));
  const chain = { select: vi.fn(), eq: vi.fn(), upsert,
    maybeSingle: vi.fn(async () => ({ data: cpf ? { cpf } : null, error })) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  const from = vi.fn(() => chain);
  return { client: { from } as unknown as SupabaseClient, from, upsert };
}

describe('Private Memed physician identity', () => {
  it('uses the private table and never writes the public directory', async () => {
    const db = database('52998224725');
    await storeMemedDoctorCpf(db.client, 'doctor', '52998224725');
    expect(db.from).toHaveBeenCalledWith('memed_doctor_identities');
    expect(db.from).not.toHaveBeenCalledWith('doctors');
    expect(db.upsert).toHaveBeenCalledWith({ doctor_id: 'doctor', cpf: '52998224725' },
      { onConflict: 'doctor_id', ignoreDuplicates: true });
  });
  it('rejects concurrent identity conflicts rather than overwriting CPF', async () => {
    const db = database('11144477735');
    await expect(storeMemedDoctorCpf(db.client, 'doctor', '52998224725'))
      .rejects.toThrow('memed_private_identity_conflict');
  });
  it('sanitizes persistence errors', async () => {
    const db = database(null, { details: 'synthetic-private-cpf' });
    await expect(storeMemedDoctorCpf(db.client, 'doctor', '52998224725'))
      .rejects.toThrow('memed_private_identity_persistence_failed');
  });
  it('returns a missing identity explicitly', async () => {
    await expect(getMemedDoctorCpf(database(null).client, 'doctor')).resolves.toBeNull();
  });
});
