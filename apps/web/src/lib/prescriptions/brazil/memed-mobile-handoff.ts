import type { AstroCookieSetOptions } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@autamedica/types';
import { isMemedMobileEnabled, isMemedPilotDoctor } from '@/lib/prescriptions/brazil/memed-pilot';

export const MEMED_MOBILE_HANDOFF_TTL_SECONDS = 45;
export const MEMED_MOBILE_EXCHANGE_PATH = '/api/doctors/memed-mobile/session-exchange';
export const MEMED_MOBILE_TARGET_PATH = '/doctors/prescriptions/memed-mobile';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPAQUE_CODE_REGEX = /^[A-Za-z0-9_-]{32,128}$/;
const ALLOWED_NEXT_KEYS = new Set(['appointmentId', 'requestId', 'patientId']);

export interface AuthorizedMemedMobileDoctor {
  id: string;
  licenseNumber: string;
  ufBrazil: string;
}

export type MemedMobileDoctorAuthReason =
  | 'memed_mobile_not_enabled'
  | 'active_doctor_profile_required'
  | 'memed_pilot_doctor_required'
  | 'verified_crm_required';

export interface MemedMobileDoctorAuthResult {
  ok: boolean;
  doctor?: AuthorizedMemedMobileDoctor;
  reason?: MemedMobileDoctorAuthReason;
}

export interface HandoffRecordInput {
  userId: string;
  doctorId: string;
  nextPath: string;
  accessToken: string;
  refreshToken: string;
  ttlSeconds?: number;
}

export interface ConsumedHandoffRecord {
  userId: string;
  doctorId: string;
  nextPath: string;
  accessToken: string;
  refreshToken: string;
}

type HandoffDbError = { code?: string; message?: string } | null;

export interface HandoffStoreClient {
  from(table: 'memed_mobile_session_handoffs'): {
    insert(values: {
      code_hash: string;
      user_id: string;
      doctor_id: string;
      next_path: string;
      access_token: string;
      refresh_token: string;
      expires_at: string;
    }): Promise<{ error: HandoffDbError }>;
  };
  rpc(
    fn: 'consume_memed_mobile_session_handoff',
    args: { p_code_hash: string },
  ): Promise<{
    data: Array<{
      user_id: string;
      doctor_id: string;
      next_path: string;
      access_token: string | null;
      refresh_token: string | null;
    }> | null;
    error: HandoffDbError;
  }>;
}

function hasWhitespaceOrControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f || /\s/.test(value[i])) {
      return true;
    }
  }
  return false;
}

/**
 * Strict allowlist for post-exchange navigation.
 * Only permits `/doctors/prescriptions/memed-mobile` with a single clinical UUID
 * (`appointmentId`, `requestId`, or `patientId`), blocking open redirects.
 */
export function validateMemedMobileNextPath(rawNext: unknown): string | null {
  if (typeof rawNext !== 'string') return null;
  if (rawNext.length === 0 || rawNext.length > 256) return null;
  if (!rawNext.startsWith(`${MEMED_MOBILE_TARGET_PATH}?`)) return null;
  if (
    rawNext.startsWith('//') ||
    rawNext.includes('\\') ||
    rawNext.includes('#') ||
    rawNext.includes('@') ||
    hasWhitespaceOrControlChar(rawNext)
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawNext, 'https://doctor.autamedica.com');
  } catch {
    return null;
  }

  if (
    parsed.origin !== 'https://doctor.autamedica.com' ||
    parsed.pathname !== MEMED_MOBILE_TARGET_PATH ||
    parsed.hash !== ''
  ) {
    return null;
  }

  const entries = Array.from(parsed.searchParams.entries());
  if (entries.length !== 1) return null;

  const [key, value] = entries[0];
  if (!ALLOWED_NEXT_KEYS.has(key) || !UUID_REGEX.test(value)) {
    return null;
  }

  return `${MEMED_MOBILE_TARGET_PATH}?${key}=${value}`;
}

/** Ensures handoff codes are high-entropy opaque strings and never JWTs. */
export function isValidHandoffCode(rawCode: unknown): rawCode is string {
  return (
    typeof rawCode === 'string' &&
    OPAQUE_CODE_REGEX.test(rawCode) &&
    !rawCode.includes('.')
  );
}

/** Validates refresh token format without logging or altering token contents. */
export function isValidRefreshTokenInput(rawToken: unknown): rawToken is string {
  return (
    typeof rawToken === 'string' &&
    rawToken.length >= 1 &&
    rawToken.length <= 2048 &&
    !hasWhitespaceOrControlChar(rawToken)
  );
}

export function generateOpaqueHandoffCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashHandoffCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function buildSessionExchangeCookieOptions(
  requestUrl: URL,
  options: Record<string, unknown> | undefined,
  isProd: boolean,
): AstroCookieSetOptions {
  const hostname = requestUrl.hostname.toLowerCase();
  const useDomainOverride =
    isProd && (hostname === 'autamedica.com' || hostname.endsWith('.autamedica.com'));

  return {
    ...(options ?? {}),
    httpOnly: true,
    secure: isProd || requestUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    domain: useDomainOverride ? '.autamedica.com' : undefined,
  } as AstroCookieSetOptions;
}

/**
 * Shared active-doctor, Brazilian CRM, pilot scope, and verified CFM license check
 * used by both `session-exchange` and `memed-mobile-context`.
 */
export async function verifyAuthorizedMemedMobileDoctor(
  admin: SupabaseClient<Database>,
  userId: string,
  runtimeEnv?: Record<string, unknown>,
): Promise<MemedMobileDoctorAuthResult> {
  if (!isMemedMobileEnabled(runtimeEnv)) {
    return { ok: false, reason: 'memed_mobile_not_enabled' };
  }

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('active')
    .eq('user_id', userId)
    .maybeSingle();
  if (profileError || profile?.active !== true) {
    return { ok: false, reason: 'active_doctor_profile_required' };
  }

  const { data: doctor, error: doctorError } = await admin
    .from('doctors')
    .select('id, active, license_type, license_number, uf_brazil, care_country')
    .eq('user_id', userId)
    .maybeSingle();
  if (
    doctorError ||
    !doctor?.active ||
    doctor.license_type !== 'CRM' ||
    doctor.care_country !== 'BR' ||
    !isMemedPilotDoctor(runtimeEnv, doctor.id)
  ) {
    return { ok: false, reason: 'memed_pilot_doctor_required' };
  }

  const { data: licenses, error: licenseError } = await admin
    .from('doctor_licenses')
    .select(
      'license_number, uf_brazil, status, cfm_validation_status, cfm_evidence_path, cfm_review_notes, cfm_reviewed_by, cfm_reviewed_at, cfm_last_checked_at',
    )
    .eq('doctor_id', doctor.id)
    .eq('license_type', 'CRM')
    .limit(20);

  const digits = (value: unknown) => String(value ?? '').replace(/\D/g, '');
  const validLicense =
    !licenseError &&
    licenses?.some(
      (lic) =>
        lic.status === 'active' &&
        lic.cfm_validation_status === 'valid' &&
        digits(lic.license_number) === digits(doctor.license_number) &&
        lic.uf_brazil?.toUpperCase() === doctor.uf_brazil?.toUpperCase() &&
        Boolean(lic.cfm_evidence_path?.trim()) &&
        (lic.cfm_review_notes?.trim().length ?? 0) >= 10 &&
        Boolean(lic.cfm_reviewed_by && lic.cfm_reviewed_at && lic.cfm_last_checked_at),
    );

  if (!validLicense) {
    return { ok: false, reason: 'verified_crm_required' };
  }

  return {
    ok: true,
    doctor: {
      id: doctor.id,
      licenseNumber: doctor.license_number ?? '',
      ufBrazil: doctor.uf_brazil ?? '',
    },
  };
}

export async function createHandoffCode(
  admin: SupabaseClient<Database>,
  input: HandoffRecordInput,
): Promise<{ code: string; expiresInSeconds: number }> {
  const ttlSeconds = input.ttlSeconds ?? MEMED_MOBILE_HANDOFF_TTL_SECONDS;
  const code = generateOpaqueHandoffCode();
  const codeHash = await hashHandoffCode(code);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

  const store = admin as unknown as HandoffStoreClient;
  const { error } = await store.from('memed_mobile_session_handoffs').insert({
    code_hash: codeHash,
    user_id: input.userId,
    doctor_id: input.doctorId,
    next_path: input.nextPath,
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    expires_at: expiresAt,
  });

  if (error) {
    throw new Error('memed_mobile_handoff_persist_failed');
  }

  return { code, expiresInSeconds: ttlSeconds };
}

export async function consumeHandoffCode(
  admin: SupabaseClient<Database>,
  rawCode: string,
): Promise<ConsumedHandoffRecord | null> {
  if (!isValidHandoffCode(rawCode)) return null;

  const codeHash = await hashHandoffCode(rawCode);
  const store = admin as unknown as HandoffStoreClient;
  const { data, error } = await store.rpc('consume_memed_mobile_session_handoff', {
    p_code_hash: codeHash,
  });

  if (error) {
    throw new Error('memed_mobile_handoff_consume_failed');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row.user_id !== 'string' ||
    typeof row.doctor_id !== 'string' ||
    typeof row.next_path !== 'string' ||
    typeof row.access_token !== 'string' ||
    typeof row.refresh_token !== 'string' ||
    row.access_token.length === 0 ||
    row.refresh_token.length === 0
  ) {
    return null;
  }

  return {
    userId: row.user_id,
    doctorId: row.doctor_id,
    nextPath: row.next_path,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
  };
}
