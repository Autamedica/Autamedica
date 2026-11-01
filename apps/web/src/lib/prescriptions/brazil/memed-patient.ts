import type { SupabaseClient } from '@supabase/supabase-js';

export function validCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i);
    const digit = (sum * 10) % 11;
    if ((digit === 10 ? 0 : digit) !== Number(cpf[length])) return false;
  }
  return true;
}

export function validBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && date.getUTCFullYear() >= 1900 && date.getTime() < Date.now();
}

export interface MemedPatient {
  idExterno: string;
  nome: string;
  cpf: string;
  data_nascimento: string;
  sexo: 'Masculino' | 'Feminino';
}

/** Patient identity is resolved exclusively on the server, before issuing a token. */
export async function resolveMemedPatient(
  admin: SupabaseClient, doctorId: string, patientId: unknown,
): Promise<MemedPatient> {
  if (typeof patientId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(patientId)) {
    throw new Error('memed_patient_required');
  }
  const now = new Date();
  const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [team, visit] = await Promise.all([
    admin.from('patient_care_team').select('id').eq('doctor_id', doctorId)
      .eq('patient_id', patientId).eq('active', true).limit(1).maybeSingle(),
    admin.from('appointments').select('id').eq('doctor_id', doctorId)
      .eq('patient_id', patientId).is('deleted_at', null)
      .or(`status.eq.completed,and(status.eq.in_progress,start_time.lte.${now.toISOString()},start_time.gte.${recent})`)
      .limit(1).maybeSingle(),
  ]);
  if (team.error || visit.error) throw new Error('memed_patient_authorization_unavailable');
  if (!team.data && !visit.data) throw new Error('doctor_patient_access_required');
  const { data: patient, error } = await admin.from('patients')
    .select('user_id, active, cpf, birth_date, gender, lgpd_consent, care_country').eq('id', patientId).maybeSingle();
  if (error) throw new Error('memed_patient_lookup_failed');
  if (patient?.care_country !== 'BR') throw new Error('memed_patient_country_required');
  if (!patient?.active || patient.lgpd_consent !== true) throw new Error('memed_patient_consent_required');
  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('first_name, last_name').eq('user_id', patient.user_id).maybeSingle();
  if (profileError) throw new Error('memed_patient_lookup_failed');
  const name = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim();
  const cpf = String(patient.cpf ?? '').replace(/\D/g, '');
  const birthDate = String(patient.birth_date ?? '');
  const gender = String(patient.gender ?? '').toLowerCase();
  if (!profile?.first_name?.trim() || !profile.last_name?.trim() || !validCpf(cpf)
      || !validBirthDate(birthDate) || !/^(male|female|masculino|feminino|m|f)$/.test(gender)) {
    throw new Error('memed_patient_identity_incomplete');
  }
  return { idExterno: `autamedica-${patientId}`, nome: name, cpf,
    data_nascimento: birthDate.split('-').reverse().join('/'),
    sexo: /^(male|masculino|m)$/.test(gender) ? 'Masculino' : 'Feminino' };
}

