import type { SupabaseClient } from '@supabase/supabase-js';

import { validCpf } from '@/lib/prescriptions/brazil/cpf';
export { validCpf } from '@/lib/prescriptions/brazil/cpf';

function hasControlChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
const ADDRESS_CITY_SEPARATOR = ' — ';

export function validBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && date.getUTCFullYear() >= 1900 && date.getTime() < Date.now();
}

export function normalizePatientText(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function validPatientAddress(value: string): boolean {
  const normalized = normalizePatientText(value);
  return normalized.length >= 5 && normalized.length <= 200 && !hasControlChars(normalized);
}

export function validPatientCity(value: string): boolean {
  const normalized = normalizePatientText(value);
  return normalized.length >= 2 && normalized.length <= 100 && !hasControlChars(normalized);
}

export function formatStoredPatientAddress(address: string, city?: string): string {
  const cleanAddress = normalizePatientText(address);
  const cleanCity = city ? normalizePatientText(city) : '';
  return cleanCity ? `${cleanAddress}${ADDRESS_CITY_SEPARATOR}${cleanCity}` : cleanAddress;
}

export function parseStoredPatientAddress(raw: unknown): { endereco?: string; cidade?: string } {
  const normalized = normalizePatientText(raw);
  if (normalized.length < 5 || normalized.length > 320 || hasControlChars(normalized)) {
    return {};
  }
  const sepIndex = normalized.indexOf(ADDRESS_CITY_SEPARATOR);
  if (sepIndex > 0) {
    const street = normalized.slice(0, sepIndex).trim();
    const city = normalized.slice(sepIndex + ADDRESS_CITY_SEPARATOR.length).trim();
    const result: { endereco?: string; cidade?: string } = {};
    if (street.length >= 5 && street.length <= 200) result.endereco = street;
    if (city.length >= 2 && city.length <= 100) result.cidade = city;
    return result;
  }
  return { endereco: normalized.slice(0, 200) };
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
  telefone?: string;
  data_nascimento?: string;
  sexo?: 'Masculino' | 'Feminino';
  endereco?: string;
  cidade?: string;
}

export interface MemedPatientDemographicsInput {
  birthDate?: string;
  gender?: 'male' | 'female';
  address?: string;
  city?: string;
}

/** Patient identity is resolved exclusively on the server, before issuing a token. */
export async function resolveMemedPatient(
  admin: SupabaseClient, doctorId: string, patientId: unknown,
  demographics?: MemedPatientDemographicsInput,
): Promise<MemedPatient> {
  if (typeof patientId !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(patientId)) {
    throw new Error('memed_patient_required');
  }
  const now = new Date();
  const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const [team, visit, dispatch, doctorPatient, privateLink] = await Promise.all([
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
    admin.from('doctor_patient').select('patient_id')
      .eq('doctor_id', doctorId).eq('patient_id', patientId)
      .limit(1).maybeSingle(),
    admin.from('patient_private_identities').select('id')
      .eq('doctor_id', doctorId).eq('patient_id', patientId)
      .limit(1).maybeSingle(),
  ]);
  if (team.error || visit.error || dispatch.error || doctorPatient.error || privateLink.error) {
    throw new Error('memed_patient_authorization_unavailable');
  }
  if (!team.data && !visit.data && !dispatch.data && !doctorPatient.data && !privateLink.data) {
    throw new Error('doctor_patient_access_required');
  }
  if (demographics) {
    const updatePayload: Record<string, string> = {};
    if (demographics.birthDate !== undefined) {
      if (!validBirthDate(demographics.birthDate)) throw new Error('memed_patient_demographics_invalid');
      updatePayload.birth_date = demographics.birthDate;
    }
    if (demographics.gender !== undefined) {
      if (!/^(male|female)$/.test(demographics.gender)) throw new Error('memed_patient_demographics_invalid');
      updatePayload.gender = demographics.gender;
    }
    if (demographics.city !== undefined && demographics.address === undefined) {
      throw new Error('memed_patient_demographics_invalid');
    }
    if (demographics.address !== undefined) {
      if (!validPatientAddress(demographics.address)) throw new Error('memed_patient_demographics_invalid');
      if (demographics.city !== undefined && !validPatientCity(demographics.city)) {
        throw new Error('memed_patient_demographics_invalid');
      }
      updatePayload.address = formatStoredPatientAddress(demographics.address, demographics.city);
    }
    if (Object.keys(updatePayload).length === 0) {
      throw new Error('memed_patient_demographics_invalid');
    }
    const { data: updatedPatient, error: demographicsError } = await admin.from('patients')
      .update({ ...updatePayload, updated_at: now.toISOString() })
      .eq('id', patientId).eq('care_country', 'BR').select('id').maybeSingle();
    if (demographicsError || !updatedPatient) throw new Error('memed_patient_demographics_update_failed');
  }
  const { data: patient, error } = await admin.from('patients')
    .select('user_id, active, cpf, birth_date, gender, address, lgpd_consent, care_country').eq('id', patientId).maybeSingle();
  if (error) throw new Error('memed_patient_lookup_failed');
  if (patient?.care_country !== 'BR') throw new Error('memed_patient_country_required');
  if (!patient?.active || patient.lgpd_consent !== true) throw new Error('memed_patient_consent_required');
  let firstName = '';
  let lastName = '';
  let cpf = String(patient.cpf ?? '').replace(/\D/g, '');
  let telefone: string | undefined;
  let birthDate = String(patient.birth_date ?? '');
  let gender = String(patient.gender ?? '').toLowerCase();
  const { data: privateIdentity, error: privateIdentityError } = await admin
    .from('patient_private_identities')
    .select('full_name, document_type, document_number, birth_date, gender, phone, consent_at, consent_scope')
    .eq('patient_id', patientId)
    .eq('doctor_id', doctorId)
    .maybeSingle();
  if (privateIdentityError) throw new Error('memed_patient_lookup_failed');

  if (privateIdentity) {
    // Identity explicitly attested by this doctor in the current clinical relationship.
    if (!privateIdentity.consent_at
        || privateIdentity.consent_scope !== 'prescription_issuance_and_delivery') {
      throw new Error('memed_patient_consent_required');
    }
    const nameParts = String(privateIdentity.full_name ?? '').trim().split(/\s+/);
    firstName = nameParts.shift() ?? '';
    lastName = nameParts.join(' ');
    cpf = privateIdentity.document_type === 'CPF'
      ? String(privateIdentity.document_number ?? '').replace(/\D/g, '') : '';
    telefone = String(privateIdentity.phone ?? '').trim().replace(/[^\d+]/g, '') || undefined;
    birthDate = String(privateIdentity.birth_date ?? birthDate);
    gender = String(privateIdentity.gender ?? gender).toLowerCase();
    if (!firstName || !lastName || !validCpf(cpf)) {
      throw new Error('memed_patient_identity_incomplete');
    }
    if (telefone && !/^\+?\d{6,20}$/.test(telefone)) {
      throw new Error('memed_patient_identity_incomplete');
    }
  } else if (!patient.user_id) {
    // Existing pharmacy guest behavior is intentionally unchanged.
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
    if (guestDispatch?.lgpd_consent !== true) {
      throw new Error('memed_patient_consent_required');
    }
    const nameParts = String(guestDispatch.patient_name ?? '').trim().split(/\s+/);
    firstName = nameParts.shift() ?? '';
    lastName = nameParts.join(' ');
    cpf = String(guestDispatch.patient_cpf ?? '').replace(/\D/g, '');
    telefone = String(guestDispatch.patient_phone ?? '').trim().replace(/[^\d+]/g, '');
    if (!firstName || !lastName || !/^\+?\d{6,20}$/.test(telefone) || !validCpf(cpf)) {
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
  const patientData: MemedPatient = { idExterno: `autamedica-${patientId}`, nome: name, cpf, ...(telefone ? { telefone } : {}) };
  // Express pharmacy/Jordan intake intentionally collects no DOB, gender or address.
  // Memed accepts these attributes as optional for simple RX and requires address for
  // controlled / Notificacao de Receita B (SNCR / RDC 1.000/2025). Never fabricate them.
  if (birthDate && validBirthDate(birthDate)) {
    patientData.data_nascimento = birthDate.split('-').reverse().join('/');
  }
  if (/^(male|female|masculino|feminino|m|f)$/.test(gender)) {
    patientData.sexo = /^(male|masculino|m)$/.test(gender) ? 'Masculino' : 'Feminino';
  }
  const parsedAddress = parseStoredPatientAddress(patient.address);
  if (parsedAddress.endereco) {
    patientData.endereco = parsedAddress.endereco;
  }
  if (parsedAddress.cidade) {
    patientData.cidade = parsedAddress.cidade;
  }
  return patientData;
}
