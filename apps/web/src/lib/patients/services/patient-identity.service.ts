import {
  fetchOfficialIdentity,
  type OfficialIdentityResult,
  type RenaperSexId,
} from '@/lib/interoperability/non-fhir.service';

export type PatientIdentityStatus =
  | 'unverified'
  | 'pending'
  | 'verified_renaper'
  | 'mismatch'
  | 'not_applicable';

type IdentityRpcClient = {
  rpc(
    name: 'claim_renaper_identity_lookup',
    args: { p_patient_id: string | null; p_dispatch_request_id: string | null; p_limit: number },
  ): Promise<{ data: number | null; error: { message?: string; code?: string } | null }>;
};

type PersistIdentityRpcClient = {
  rpc(
    name: 'persist_renaper_identity_result',
    args: {
      p_patient_id: string | null;
      p_dispatch_request_id: string | null;
      p_user_id: string | null;
      p_identity_status: PatientIdentityStatus;
      p_dni: string;
      p_official_full_name: string | null;
      p_official_first_name: string | null;
      p_official_last_name: string | null;
      p_official_cuil: string | null;
      p_official_birth_date: string | null;
      p_official_gender: string | null;
      p_puco_coverage_name: string | null;
      p_puco_coverage_code: string | null;
      p_verified_at: string | null;
      p_sync_profile_name: boolean;
    },
  ): Promise<{ data: boolean | null; error: { message?: string; code?: string } | null }>;
};

export interface PersistedOfficialIdentity {
  identityStatus: PatientIdentityStatus;
  officialFullName: string | null;
  officialFirstName: string | null;
  officialLastName: string | null;
  dni: string;
  cuil: string | null;
  birthDate: string | null;
  gender: string | null;
  pucoCoverageName: string | null;
  pucoCoverageCode: string | null;
}

const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '');
const clean = (value: string | null | undefined) => value?.trim() || null;

function tokens(value: string): string[] {
  return value.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('es-AR')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function declaredNameMatchesOfficial(
  declared: string | null | undefined,
  official: string,
): boolean {
  if (!declared?.trim()) return true;
  const declaredTokens = tokens(declared);
  const officialTokens = tokens(official);
  if (!declaredTokens.length || !officialTokens.length) return false;
  const matched = new Set(declaredTokens.filter((token) => officialTokens.includes(token)));
  return matched.size / Math.max(declaredTokens.length, officialTokens.length) >= 0.5;
}

function normalizeBirthDate(value: string | null): string | null {
  if (!value) return null;
  const input = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  const local = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(input);
  const year = iso ? Number(iso[1]) : local ? Number(local[3]) : NaN;
  const month = iso ? Number(iso[2]) : local ? Number(local[2]) : NaN;
  const day = iso ? Number(iso[3]) : local ? Number(local[1]) : NaN;
  if (![year, month, day].every(Number.isInteger)) return null;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

function normalizeGender(value: string | null): string | null {
  const normalized = (value ?? '').trim().toUpperCase();
  if (['F', 'FEMENINO', 'FEMALE'].includes(normalized)) return 'F';
  if (['M', 'MASCULINO', 'MALE'].includes(normalized)) return 'M';
  if (['X', 'NO BINARIO', 'NO_BINARIO', 'OTHER'].includes(normalized)) return 'X';
  return null;
}

export function buildOfficialIdentityRecord(
  result: OfficialIdentityResult,
  requestedDni: string,
  declaredName?: string | null,
): PersistedOfficialIdentity {
  const person = result.person;
  const firstName = clean(person.nombres);
  const lastName = clean(person.apellido);
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
  const officialCuil = digits(person.cuil);
  const cuil = officialCuil.length === 11 ? officialCuil : null;
  const coverage = result.coverages[0] ?? null;
  const gender = normalizeGender(clean(person.sexo));
  const verified = Boolean(fullName && cuil && gender && declaredNameMatchesOfficial(declaredName, fullName));

  return {
    identityStatus: !fullName || !cuil || !gender ? 'pending' : verified ? 'verified_renaper' : 'mismatch',
    officialFullName: fullName,
    officialFirstName: firstName,
    officialLastName: lastName,
    dni: digits(person.numeroDocumento) || digits(requestedDni),
    cuil,
    birthDate: normalizeBirthDate(clean(person.fechaNacimiento)),
    gender,
    pucoCoverageName: clean(coverage?.cobertura),
    pucoCoverageCode: clean(coverage?.rnos),
  };
}

/** Reserve one of the three allowed lookups with a row lock in Postgres. */
export async function claimRenaperIdentityLookup(input: {
  supabase: unknown;
  patientId?: string | null;
  dispatchRequestId?: string | null;
  limit?: number;
}): Promise<number> {
  const patientId = input.patientId ?? null;
  const dispatchRequestId = patientId ? null : input.dispatchRequestId ?? null;
  if (!patientId && !dispatchRequestId) return 0;

  const client = input.supabase as IdentityRpcClient;
  const { data, error } = await client.rpc('claim_renaper_identity_lookup', {
    p_patient_id: patientId,
    p_dispatch_request_id: dispatchRequestId,
    p_limit: input.limit ?? 3,
  });
  if (error) {
    throw Object.assign(new Error('RENAPER lookup budget could not be reserved'), {
      code: error.code ?? 'RENAPER_LOOKUP_CLAIM_FAILED',
    });
  }
  if (data === -1) {
    throw Object.assign(new Error('RENAPER lookup limit reached'), {
      code: 'RENAPER_LOOKUP_LIMIT_REACHED',
    });
  }
  if (data === -2 || data === null) {
    throw Object.assign(new Error('RENAPER identity scope not found'), {
      code: 'RENAPER_LOOKUP_SCOPE_NOT_FOUND',
    });
  }
  return data;
}

export async function persistOfficialIdentityResult(input: {
  supabase: unknown;
  result: OfficialIdentityResult;
  dni: string;
  patientId?: string | null;
  dispatchRequestId?: string | null;
  userId?: string | null;
  declaredName?: string | null;
  syncProfileName?: boolean;
}): Promise<PersistedOfficialIdentity> {
  if (digits(input.result.person.numeroDocumento) !== digits(input.dni)) {
    throw Object.assign(new Error('RENAPER document mismatch'), { code: 'RENAPER_DOCUMENT_MISMATCH' });
  }

  const identity = buildOfficialIdentityRecord(input.result, input.dni, input.declaredName);
  const client = input.supabase as PersistIdentityRpcClient;
  const { error } = await client.rpc('persist_renaper_identity_result', {
    p_patient_id: input.patientId ?? null,
    p_dispatch_request_id: input.dispatchRequestId ?? null,
    p_user_id: input.userId ?? null,
    p_identity_status: identity.identityStatus,
    p_dni: identity.dni,
    p_official_full_name: identity.officialFullName,
    p_official_first_name: identity.officialFirstName,
    p_official_last_name: identity.officialLastName,
    p_official_cuil: identity.cuil,
    p_official_birth_date: identity.birthDate,
    p_official_gender: identity.gender,
    p_puco_coverage_name: identity.pucoCoverageName,
    p_puco_coverage_code: identity.pucoCoverageCode,
    p_verified_at: identity.identityStatus === 'verified_renaper' ? new Date().toISOString() : null,
    p_sync_profile_name: input.syncProfileName ?? false,
  });
  if (error) throw error;

  return identity;
}

export async function fetchAndPersistOfficialIdentity(input: {
  supabase: unknown;
  dni: string;
  sexId: RenaperSexId;
  patientId?: string | null;
  dispatchRequestId?: string | null;
  userId?: string | null;
  declaredName?: string | null;
  runtimeEnv?: Record<string, unknown>;
  timeoutMs?: number;
  syncProfileName?: boolean;
}): Promise<PersistedOfficialIdentity | null> {
  await claimRenaperIdentityLookup({
    supabase: input.supabase,
    patientId: input.patientId,
    dispatchRequestId: input.dispatchRequestId,
  });
  const lookup = fetchOfficialIdentity({
    dni: digits(input.dni),
    sexId: input.sexId,
    runtimeEnv: input.runtimeEnv,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), input.timeoutMs ?? 10000);
    });
    const result = await Promise.race([lookup, timeout]);
    if (!result) return null;
    return await persistOfficialIdentityResult({ ...input, result });
  } finally {
    if (timer) clearTimeout(timer);
  }
}
