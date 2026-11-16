import type { SupabaseClient } from '@supabase/supabase-js';

import { validCpf } from '@/lib/prescriptions/brazil/cpf';
export { validCpf } from '@/lib/prescriptions/brazil/cpf';
export function validBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && date.getUTCFullYear() >= 1900 && date.getTime() < Date.now();
}

export async function assertMemedDispatchEncounter(
  admin: SupabaseClient,
  doctorId: string,
  patientId: string,
  requestId: string,
): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) {
    throw new Error('clinical_encounter_required');
  }
  const recent = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin.from('pharmacy_dispatch_requests')
    .select('id')
    .eq('id', requestId)
    .eq('assigned_doctor_id', doctorId)
    .eq('patient_id', patientId)
    .in('status', ['in_call', 'completed'])
    .gte('call_started_at', recent)
    .maybeSingle();
  if (error) throw new Error('memed_patient_authorization_unavailable');
  if (!data) throw new Error('clinical_encounter_required');
}

export interface MemedPatient {
  idExterno: string;
  nome: string;
  cpf: string;
  data_nascimento?: string;
  sexo?: 'Masculino' | 'Feminino';
}

/** Patient identity is resolved exclusively on the server, before issuing a token. */
export async function resolveMemedPatient(
  admin: SupabaseClient, doctorId: string, patientId: unknown,
  demographics?: { birthDate: string; gender: 'male' | 'female' },
): Promise<MemedPatient> {
  if (typeof patientId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(patientId)) {
    throw new Error('memed_patient_required');
  }
  const now = new Date();
  const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [team, visit, dispatch] = await Promise.all([
    admin.from('patient_care_team').select('id').eq('doctor_id', doctorId)
      .eq('patient_id', patientId).eq('active', true).limit(1).maybeSingle(),
    admin.from('appointments').select('id').eq('doctor_id', doctorId)
      .eq('patient_id', patientId).is('deleted_at', null)
      .or(`status.eq.completed,and(status.eq.in_progress,start_time.lte.${now.toISOString()},start_time.gte.${recent})`)
      .limit(1).maybeSingle(),
    admin.from('pharmacy_dispatch_requests').select('id')
      .eq('assigned_doctor_id', doctorId).eq('patient_id', patientId)
      .in('status', ['in_call', 'completed']).gte('call_started_at', recent)
      .limit(1).maybeSingle(),
  ]);
  if (team.error || visit.error || dispatch.error) throw new Error('memed_patient_authorization_unavailable');
  if (!team.data && !visit.data && !dispatch.data) throw new Error('doctor_patient_access_required');
  if (demographics) {
    if (!validBirthDate(demographics.birthDate)
        || !/^(male|female)$/.test(demographics.gender)) {
      throw new Error('memed_patient_demographics_invalid');
    }
    const { data: updatedPatient, error: demographicsError } = await admin.from('patients')
      .update({ birth_date: demographics.birthDate, gender: demographics.gender, updated_at: now.toISOString() })
      .eq('id', patientId).eq('care_country', 'BR').select('id').maybeSingle();
    if (demographicsError || !updatedPatient) throw new Error('memed_patient_demographics_update_failed');
  }
  const { data: patient, error } = await admin.from('patients')
    .select('user_id, active, cpf, birth_date, gender, lgpd_consent, care_country').eq('id', patientId).maybeSingle();
  if (error) throw new Error('memed_patient_lookup_failed');
  if (patient?.care_country !== 'BR') throw new Error('memed_patient_country_required');
  if (!patient?.active || patient.lgpd_consent !== true) throw new Error('memed_patient_consent_required');
  let firstName = '';
  let lastName = '';
  let cpf = String(patient.cpf ?? '').replace(/\\D/g, '');
  const birthDate = String(patient.birth_date ?? '');
  const gender = String(patient.gender ?? '').toLowerCase();
  if (!patient.user_id) {
    const { data: guestDispatch, error: guestDispatchError } = await admin
      .from('pharmacy_dispatch_requests')
      .select('patient_name, patient_cpf, patient_phone, lgpd_consent')
      .eq('patient_id', patientId)
      .eq('assigned_doctor_id', doctorId)
      .in('status', ['in_call', 'completed'])
      .gte('call_started_at', recent)
      .order('call_started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (guestDispatchError) throw new Error('memed_patient_lookup_failed');
    if (!guestDispatch || guestDispatch.lgpd_consent !== true) {
      throw new Error('memed_patient_consent_required');
    }
    const nameParts = String(guestDispatch.patient_name ?? '').trim().split(/\\s+/);
    firstName = nameParts.shift() ?? '';
    lastName = nameParts.join(' ');
    cpf = String(guestDispatch.patient_cpf ?? '').replace(/\\D/g, '');
    const phone = String(guestDispatch.patient_phone ?? '').replace(/[^\\d+]/g, '');
    if (!firstName || !lastName || phone.replace(/\\D/g, '').length < 6 || !validCpf(cpf)) {
      throw new Error('memed_patient_identity_incomplete');
    }
  } else {
    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('first_name, last_name').eq('user_id', patient.user_id).maybeSingle();
    if (profileError) throw new Error('memed_patient_lookup_failed');
    firstName = String(profile?.first_name ?? '').trim();
    lastName = String(profile?.last_name ?? '').trim();
    if (!firstName || !lastName || !validCpf(cpf)) {
      throw new Error('memed_patient_identity_incomplete');
    }
  }
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  const patientData: MemedPatient = { idExterno: `autamedica-${patientId}`, nome: name, cpf };
  // Express pharmacy/Jordan intake intentionally collects no DOB or gender.
  // Memed accepts these demographic attributes as optional; never fabricate them.
  if (birthDate && validBirthDate(birthDate)) {
    patientData.data_nascimento = birthDate.split('-').reverse().join('/');
  }
  if (/^(male|female|masculino|feminino|m|f)$/.test(gender)) {
    patientData.sexo = /^(male|masculino|m)$/.test(gender) ? 'Masculino' : 'Feminino';
  }
  return patientData;
}

