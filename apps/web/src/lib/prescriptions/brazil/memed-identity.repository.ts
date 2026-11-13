import type { SupabaseClient } from '@supabase/supabase-js';

/** The public doctor directory must never receive CPF collected for Memed. */
export async function getMemedDoctorCpf(admin: SupabaseClient, doctorId: string): Promise<string | null> {
  const { data, error } = await admin.from('memed_doctor_identities')
    .select('cpf').eq('doctor_id', doctorId).maybeSingle();
  if (error) throw new Error('memed_private_identity_lookup_failed');
  return typeof data?.cpf === 'string' ? data.cpf : null;
}

export async function storeMemedDoctorCpf(admin: SupabaseClient, doctorId: string, cpf: string): Promise<void> {
  const { error } = await admin.from('memed_doctor_identities')
    .upsert({ doctor_id: doctorId, cpf }, { onConflict: 'doctor_id', ignoreDuplicates: true });
  if (error) throw new Error('memed_private_identity_persistence_failed');
  if (await getMemedDoctorCpf(admin, doctorId) !== cpf) {
    throw new Error('memed_private_identity_conflict');
  }
}
