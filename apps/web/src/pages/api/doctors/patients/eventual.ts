import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { badRequest, forbidden, internalError, jsonOk } from '@/lib/api-helpers';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { createAstroAdminClient } from '@/lib/supabase';
import {
  validateEventualPatientDetails,
  normalizeEventualPatientDocument,
} from '@/lib/prescriptions/eventual-patient';
import {
  fetchOfficialIdentity,
  type RenaperSexId,
} from '@/lib/interoperability/non-fhir.service';

type EventualPatientRpc = {
  rpc(name: string, args: Record<string, unknown>): Promise<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>;
};

type PrivateIdentityRow = {
  patient_id?: string | null;
  full_name?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  phone?: string | null;
  email?: string | null;
};

type ExistingPatientLookupRow = {
  id?: string | null;
  user_id?: string | null;
  birth_date?: string | null;
  official_full_name?: string | null;
  official_cuil?: string | null;
  puco_coverage_name?: string | null;
  address?: string | null;
};

type EventualPatientBody = {
  fullName?: unknown;
  documentNumber?: unknown;
  birthDate?: unknown;
  gender?: unknown;
  contact?: unknown;
  consentAccepted?: unknown;
  careCountryConfirmed?: unknown;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function normalizeGenderAndSexId(raw: unknown): {
  gender: 'female' | 'male' | 'other' | null;
  sexId: RenaperSexId | null;
} {
  const val = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (val === 'f' || val === 'female' || val === 'femenino') {
    return { gender: 'female', sexId: 1 };
  }
  if (val === 'm' || val === 'male' || val === 'masculino') {
    return { gender: 'male', sexId: 2 };
  }
  if (val === 'x' || val === 'other' || val === 'no_binario' || val === 'no binario') {
    return { gender: 'other', sexId: 3 };
  }
  return { gender: null, sexId: null };
}

function normalizeRenaperBirthDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (iso) return input;
  const local = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(input);
  if (!local) return null;
  return `${local[3]}-${local[2]}-${local[1]}`;
}

function formatPhotoUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  return `data:image/jpeg;base64,${trimmed}`;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const admin = createAstroAdminClient(locals?.runtime?.env);
  const untypedAdmin = admin as unknown as SupabaseClient;
  const { data: doctor } = await admin
    .from('doctors')
    .select('id, active')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (!doctor?.id || doctor.active !== true) {
    return forbidden('doctor_profile_required');
  }

  const { data: rows, error } = await untypedAdmin
    .from('patient_private_identities')
    .select('patient_id, full_name, document_type, document_number, birth_date, gender, phone, email')
    .eq('doctor_id', doctor.id)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) {
    return internalError('eventual_patients_list_failed');
  }

  const typedRows = (rows ?? []) as PrivateIdentityRow[];
  const items = typedRows.map((row) => ({
    patientId: row.patient_id,
    fullName: row.full_name,
    dni: row.document_number,
    documentType: row.document_type,
    birthDate: row.birth_date,
    gender: row.gender,
    contact: row.phone || row.email || null,
  }));

  return jsonOk(items);
};

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return forbidden('cross_origin_request');

  let body: EventualPatientBody;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return badRequest('request_too_large');
    body = JSON.parse(raw) as EventualPatientBody;
  } catch {
    return badRequest('invalid_json');
  }

  const admin = createAstroAdminClient(locals?.runtime?.env);
  const untypedAdmin = admin as unknown as SupabaseClient;
  const { data: doctor, error: doctorError } = await admin
    .from('doctors')
    .select('id, active, care_country')
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (doctorError) return internalError('eventual_patient_doctor_lookup_failed');
  if (!doctor?.id || doctor.active !== true) return forbidden('doctor_profile_required');
  if (doctor.care_country !== 'AR' && doctor.care_country !== 'BR') {
    return forbidden('eventual_patient_doctor_country_invalid');
  }

  if (body.careCountryConfirmed !== true) return badRequest('external_patient_care_country_confirmation_required');

  const documentType = doctor.care_country === 'BR' ? 'CPF' : 'DNI';
  const documentNumber = normalizeEventualPatientDocument(String(body.documentNumber ?? ''));
  const { gender: normalizedGender, sexId } = normalizeGenderAndSexId(body.gender);

  let resolvedFullName = typeof body.fullName === 'string'
    ? body.fullName.trim().replace(/\s+/g, ' ')
    : '';
  let resolvedBirthDate = typeof body.birthDate === 'string' ? body.birthDate.trim() : '';
  let resolvedCuil: string | null = null;
  let resolvedCoverage: string | null = null;
  let resolvedAddress: string | null = null;
  let resolvedPhoto: string | null = null;

  // 1. Check if this doctor already registered this eventual patient previously
  if ((!resolvedFullName || !resolvedBirthDate) && documentNumber) {
    const { data: existingPrivateData } = await untypedAdmin
      .from('patient_private_identities')
      .select('full_name, birth_date')
      .eq('doctor_id', doctor.id)
      .eq('care_country', doctor.care_country)
      .eq('document_type', documentType)
      .eq('document_number', documentNumber)
      .maybeSingle();

    const existingPrivate = existingPrivateData as PrivateIdentityRow | null;
    if (existingPrivate) {
      if (!resolvedFullName && existingPrivate.full_name) {
        resolvedFullName = String(existingPrivate.full_name).trim();
      }
      if (!resolvedBirthDate && existingPrivate.birth_date) {
        resolvedBirthDate = String(existingPrivate.birth_date).slice(0, 10);
      }
    }
  }

  // 2. Check if an active patient with this DNI/CPF already exists in public.patients
  if ((!resolvedFullName || !resolvedBirthDate || !resolvedPhoto) && documentNumber) {
    const docColumn = documentType === 'CPF' ? 'cpf' : 'dni';
    const { data: existingPatientData } = await untypedAdmin
      .from('patients')
      .select('id, user_id, birth_date, official_full_name, official_cuil, puco_coverage_name, address')
      .eq(docColumn, documentNumber)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    const existingPatient = existingPatientData as ExistingPatientLookupRow | null;
    if (existingPatient) {
      if (!resolvedFullName && existingPatient.official_full_name) {
        resolvedFullName = String(existingPatient.official_full_name).trim();
      }
      if (!resolvedBirthDate && existingPatient.birth_date) {
        resolvedBirthDate = String(existingPatient.birth_date).slice(0, 10);
      }
      resolvedCuil = resolvedCuil || existingPatient.official_cuil || null;
      resolvedCoverage = resolvedCoverage || existingPatient.puco_coverage_name || null;
      resolvedAddress = resolvedAddress || existingPatient.address || null;

      if (existingPatient.user_id) {
        const { data: prof } = await admin
          .from('profiles')
          .select('first_name, last_name, avatar_url')
          .eq('user_id', existingPatient.user_id)
          .maybeSingle();
        if (prof) {
          const profName = [prof.first_name, prof.last_name].filter(Boolean).join(' ').trim();
          if (!resolvedFullName && profName) resolvedFullName = profName;
          if (!resolvedPhoto && prof.avatar_url) resolvedPhoto = String(prof.avatar_url);
        }
      }
    }
  }

  // 3. Live RENAPER + PUCO lookup by DNI + Sex when in Argentina
  if (doctor.care_country === 'AR' && /^\d{7,8}$/.test(documentNumber) && sexId !== null) {
    if (!resolvedFullName || !resolvedBirthDate || !resolvedPhoto || !resolvedCoverage) {
      try {
        const official = await fetchOfficialIdentity({
          dni: documentNumber,
          sexId,
          runtimeEnv: locals?.runtime?.env as Record<string, unknown> | undefined,
          timeoutMs: 4500,
        });
        const p = official.person;
        const renaperName = [p.nombres?.trim(), p.apellido?.trim()].filter(Boolean).join(' ').trim();
        if (!resolvedFullName && renaperName) {
          resolvedFullName = renaperName;
        }
        const renaperBirth = normalizeRenaperBirthDate(p.fechaNacimiento);
        if (!resolvedBirthDate && renaperBirth) {
          resolvedBirthDate = renaperBirth;
        }
        if (!resolvedCuil && p.cuil) {
          resolvedCuil = p.cuil.replace(/\D/g, '') || p.cuil;
        }
        if (!resolvedCoverage && official.coverages?.[0]?.cobertura) {
          resolvedCoverage = official.coverages[0].cobertura;
        }
        if (!resolvedAddress) {
          const addr = [
            [p.calle, p.numero].filter(Boolean).join(' ').trim(),
            p.ciudad || p.municipio,
            p.provincia,
          ].filter(Boolean).join(', ').trim();
          if (addr) resolvedAddress = addr;
        }
        if (!resolvedPhoto && p.foto) {
          resolvedPhoto = formatPhotoUrl(p.foto);
        }
      } catch {
        // Non-fatal: if RENAPER is unreachable, fall back to manual name or existing data
      }
    }
  }

  // If the doctor already provided or we resolved fullName, default birthDate when omitted
  if (resolvedFullName && !resolvedBirthDate) {
    resolvedBirthDate = '1985-01-01';
  }

  const enrichedBody: EventualPatientBody = {
    ...body,
    fullName: resolvedFullName,
    documentNumber,
    birthDate: resolvedBirthDate,
    gender: normalizedGender ?? body.gender,
  };

  const validationError = validateEventualPatientDetails(enrichedBody, doctor.care_country);
  if (validationError) return badRequest(validationError);

  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const isEmail = contact.includes('@');
  const rpcClient = admin as unknown as EventualPatientRpc;
  const { data, error } = await rpcClient.rpc('create_doctor_eventual_patient', {
    p_doctor_id: doctor.id,
    p_care_country: doctor.care_country,
    p_full_name: resolvedFullName,
    p_document_type: documentType,
    p_document_number: documentNumber,
    p_birth_date: resolvedBirthDate,
    p_gender: normalizedGender,
    p_phone: contact && !isEmail ? contact : null,
    p_email: contact && isEmail ? contact : null,
    p_consent_scope: 'prescription_issuance_and_delivery',
  });

  if (error) {
    const code = error.message ?? 'eventual_patient_create_failed';
    if (code.startsWith('eventual_patient_')) return badRequest(code);
    return internalError('eventual_patient_create_failed');
  }

  const result = data as { patient_id?: unknown; reused?: unknown } | null;
  if (!result || typeof result.patient_id !== 'string' || !UUID_PATTERN.test(result.patient_id)) {
    return internalError('eventual_patient_create_failed');
  }

  const response = jsonOk({
    patientId: result.patient_id,
    reused: result.reused === true,
    fullName: resolvedFullName,
    dni: documentNumber,
    birthDate: resolvedBirthDate,
    gender: normalizedGender,
    contact: contact || null,
    cuil: resolvedCuil,
    coverageName: resolvedCoverage,
    address: resolvedAddress,
    avatarUrl: resolvedPhoto,
  }, result.reused === true ? 200 : 201);
  response.headers.set('Cache-Control', 'no-store, private');
  response.headers.set('Pragma', 'no-cache');
  return response;
};
