/**
 * Server-side ephemeral session handoff for Android -> Memed mobile WebView.
 *
 * POST: Authenticated with `Authorization: Bearer <access_token>`. Validates
 *       doctor role + active BR CRM + verified CFM evidence and issues an
 *       opaque single-use, short-TTL handoff code.
 * GET:  Called by the embedded Android WebView. Atomically consumes the code,
 *       establishes official `@supabase/ssr` cookies (`HttpOnly`, `Secure`,
 *       `SameSite=Lax`, chunked when required) and responds 302 to
 *       `/doctors/prescriptions/memed-mobile?...`.
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { DOCTOR_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import {
  badRequest,
  forbidden,
  internalError,
  jsonOk,
  unauthorized,
} from '@/lib/api-helpers';
import { isProduction } from '@/lib/auth-utils';
import { resolvePublicSupabaseEnv } from '@/lib/runtime-env';
import {
  createAstroAdminClient,
  createSupabaseCookieClient,
  type CookieMethodsServer,
} from '@/lib/supabase';
import {
  buildSessionExchangeCookieOptions,
  consumeHandoffCode,
  createHandoffCode,
  isValidHandoffCode,
  isValidRefreshTokenInput,
  MEMED_MOBILE_EXCHANGE_PATH,
  validateMemedMobileNextPath,
  verifyAuthorizedMemedMobileDoctor,
} from '@/lib/prescriptions/brazil/memed-mobile-handoff';

const BEARER_HEADER_REGEX = /^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/i;
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  'Referrer-Policy': 'no-referrer',
} as const;

function withNoStore(response: Response): Response {
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const authorization = request.headers.get('authorization')?.trim() ?? '';
  const bearerMatch = BEARER_HEADER_REGEX.exec(authorization);
  if (!bearerMatch) {
    return withNoStore(unauthorized('bearer_token_required'));
  }
  const accessToken = bearerMatch[1];

  const auth = await withAuthRole(request, DOCTOR_ROLES, locals);
  if (!isAuthed(auth)) return withNoStore(auth);

  let payload: Record<string, unknown>;
  try {
    const rawBody = await request.text();
    if (rawBody.length === 0 || rawBody.length > 8192) {
      return withNoStore(badRequest('invalid_request_size'));
    }
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return withNoStore(badRequest('invalid_json'));
    }
    payload = parsed as Record<string, unknown>;
  } catch {
    return withNoStore(badRequest('invalid_json'));
  }

  const normalizedNext = validateMemedMobileNextPath(payload.next);
  if (!normalizedNext) {
    return withNoStore(badRequest('invalid_next_destination'));
  }

  const refreshToken = payload.refreshToken;
  if (!isValidRefreshTokenInput(refreshToken)) {
    return withNoStore(badRequest('refresh_token_required'));
  }

  try {
    const runtimeEnv = locals.runtime?.env as unknown as Record<string, unknown> | undefined;
    const admin = createAstroAdminClient(locals.runtime?.env);
    const doctorAuth = await verifyAuthorizedMemedMobileDoctor(
      admin,
      auth.user.id,
      runtimeEnv,
    );
    if (!doctorAuth.ok || !doctorAuth.doctor) {
      return withNoStore(forbidden(doctorAuth.reason ?? 'memed_pilot_doctor_required'));
    }

    const { code, expiresInSeconds } = await createHandoffCode(admin, {
      userId: auth.user.id,
      doctorId: doctorAuth.doctor.id,
      nextPath: normalizedNext,
      accessToken,
      refreshToken,
    });

    const requestUrl = new URL(request.url);
    const exchangeUrl = new URL(MEMED_MOBILE_EXCHANGE_PATH, requestUrl.origin);
    exchangeUrl.searchParams.set('code', code);
    exchangeUrl.searchParams.set('next', normalizedNext);

    return withNoStore(
      jsonOk({
        code,
        exchangeUrl: exchangeUrl.toString(),
        expiresInSeconds,
      }),
    );
  } catch (error) {
    logger.error('[memed-session-exchange] handoff issuance failed', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return withNoStore(internalError('memed_session_handoff_unavailable'));
  }
};

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const requestUrl = new URL(request.url);
  const normalizedNext = validateMemedMobileNextPath(
    requestUrl.searchParams.get('next'),
  );
  if (!normalizedNext) {
    return withNoStore(badRequest('invalid_next_destination'));
  }

  const rawCode = requestUrl.searchParams.get('code');
  if (!isValidHandoffCode(rawCode)) {
    return withNoStore(unauthorized('invalid_handoff_code'));
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const consumed = await consumeHandoffCode(admin, rawCode);
    if (!consumed) {
      return withNoStore(unauthorized('handoff_code_invalid_or_expired'));
    }

    if (consumed.nextPath !== normalizedNext) {
      return withNoStore(badRequest('handoff_destination_mismatch'));
    }

    const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(
      locals.runtime?.env,
    );
    if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
      return withNoStore(internalError('supabase_env_unavailable'));
    }

    const isProd = isProduction();
    const cookieMethods: CookieMethodsServer = {
      getAll() {
        return [];
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookies.set(
            name,
            value,
            buildSessionExchangeCookieOptions(
              requestUrl,
              options as Record<string, unknown> | undefined,
              isProd,
            ),
          );
        }
      },
    };

    const supabase = createSupabaseCookieClient(
      publicSupabaseUrl,
      publicSupabaseAnonKey,
      cookieMethods,
    );

    const { data, error } = await supabase.auth.setSession({
      access_token: consumed.accessToken,
      refresh_token: consumed.refreshToken,
    });

    if (
      error ||
      !data.session ||
      data.user?.id !== consumed.userId
    ) {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Ignore cleanup failure on rejected session exchange.
      }
      return withNoStore(unauthorized('session_exchange_failed'));
    }

    const destinationUrl = new URL(normalizedNext, requestUrl.origin).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: destinationUrl,
        ...NO_STORE_HEADERS,
      },
    });
  } catch (error) {
    logger.error('[memed-session-exchange] handoff consumption failed', {
      message: error instanceof Error ? error.message : 'unknown_error',
    });
    return withNoStore(internalError('memed_session_exchange_unavailable'));
  }
};
