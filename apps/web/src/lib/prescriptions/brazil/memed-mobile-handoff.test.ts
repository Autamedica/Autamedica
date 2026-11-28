import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DOCTOR_USER_ID = '11111111-1111-4111-8111-111111111111';
const DOCTOR_ID = '22222222-2222-4222-8222-222222222222';
const APPOINTMENT_ID = '33333333-3333-4333-8333-333333333333';
const PATIENT_ID = '44444444-4444-4444-8444-444444444444';

function makeUnsignedJwt(sub: string, extraPayload: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub,
      aud: 'authenticated',
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
      app_metadata: { role: 'doctor' },
      ...extraPayload,
    }),
  ).toString('base64url');
  return `${header}.${payload}.synthetic_signature`;
}

type HandoffRow = {
  code_hash: string;
  user_id: string;
  doctor_id: string;
  next_path: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string;
  consumed_at: string | null;
};

const mocks = vi.hoisted(() => ({
  handoffs: new Map<string, HandoffRow>(),
  nowMs: Date.now(),
  memedMobileEnabled: 'true',
  memedRxEnabled: 'true',
  resolveMemedPatient: vi.fn(),
  doctorActive: true,
  profileActive: true,
  profileRole: 'doctor',
  validLicense: true,
  appointmentRow: null as Record<string, unknown> | null,
}));

vi.mock('astro:middleware', () => ({
  defineMiddleware: (fn: unknown) => fn,
}));

vi.mock('@autamedica/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@autamedica/shared')>();
  return {
    ...original,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  };
});

vi.mock('@/lib/observability/sentry', () => ({
  initServerSentry: vi.fn(),
}));

vi.mock('@/lib/patients/services/clinical-orchestrator.service', () => ({}));
vi.mock('@/lib/notifications/notification-triggers', () => ({}));
vi.mock('@/lib/payments/triggers', () => ({}));

vi.mock('@/lib/runtime-env', () => ({
  primeRuntimeEnv: vi.fn(),
  resolvePublicSupabaseEnv: vi.fn(() => ({
    publicSupabaseUrl: 'https://qxjjrpksmwwrmubhvjew.supabase.co',
    publicSupabaseAnonKey: 'test-anon-key',
  })),
  resolveServiceRoleKey: vi.fn(() => 'test-service-role-key'),
}));

vi.mock('@/lib/prescriptions/brazil/memed-patient', () => ({
  resolveMemedPatient: mocks.resolveMemedPatient,
}));

vi.mock('@/lib/supabase', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/supabase')>();
  return {
    ...original,
    createAstroAdminClient: vi.fn(() => ({
      from: (table: string) => {
        if (table === 'memed_mobile_session_handoffs') {
          return {
            insert: async (row: Omit<HandoffRow, 'consumed_at'>) => {
              mocks.handoffs.set(row.code_hash, { ...row, consumed_at: null });
              return { error: null };
            },
          };
        }

        const filters: Record<string, unknown> = {};
        const chain = {
          select: vi.fn(() => chain),
          eq: vi.fn((col: string, val: unknown) => {
            filters[col] = val;
            return chain;
          }),
          is: vi.fn(() => chain),
          limit: vi.fn(async () => {
            if (table === 'doctor_licenses') {
              return {
                data: mocks.validLicense
                  ? [
                      {
                        license_number: '9236',
                        uf_brazil: 'RS',
                        status: 'active',
                        cfm_validation_status: 'valid',
                        cfm_evidence_path: 'ci/doctor/evidence.pdf',
                        cfm_review_notes: 'Synthetic verified CFM license review',
                        cfm_reviewed_by: 'admin-1',
                        cfm_reviewed_at: '2026-11-12T00:00:00Z',
                        cfm_last_checked_at: '2026-11-12T00:00:00Z',
                      },
                    ]
                  : [],
                error: null,
              };
            }
            return { data: [], error: null };
          }),
          maybeSingle: vi.fn(async () => {
            if (table === 'profiles') {
              return {
                data: { active: mocks.profileActive, role: mocks.profileRole },
                error: null,
              };
            }
            if (table === 'doctors') {
              return {
                data: {
                  id: DOCTOR_ID,
                  active: mocks.doctorActive,
                  license_type: 'CRM',
                  license_number: '9236',
                  uf_brazil: 'RS',
                  care_country: 'BR',
                },
                error: null,
              };
            }
            if (table === 'appointments') {
              return { data: mocks.appointmentRow, error: null };
            }
            return { data: null, error: null };
          }),
        };
        return chain;
      },
      rpc: async (fn: string, args: { p_code_hash: string }) => {
        if (fn !== 'consume_memed_mobile_session_handoff') {
          return { data: null, error: { message: 'unknown_rpc' } };
        }
        const row = mocks.handoffs.get(args.p_code_hash);
        if (!row) return { data: [], error: null };
        if (row.consumed_at !== null) return { data: [], error: null };
        if (Date.parse(row.expires_at) <= mocks.nowMs) return { data: [], error: null };

        const accessToken = row.access_token;
        const refreshToken = row.refresh_token;
        row.consumed_at = new Date(mocks.nowMs).toISOString();
        row.access_token = null;
        row.refresh_token = null;

        return {
          data: [
            {
              user_id: row.user_id,
              doctor_id: row.doctor_id,
              next_path: row.next_path,
              access_token: accessToken,
              refresh_token: refreshToken,
            },
          ],
          error: null,
        };
      },
    })),
  };
});

import {
  isValidHandoffCode,
  validateMemedMobileNextPath,
} from '@/lib/prescriptions/brazil/memed-mobile-handoff';
import { GET as exchangeGet, POST as exchangePost } from '@/pages/api/doctors/memed-mobile/session-exchange';
import { GET as contextGet } from '@/pages/api/doctors/prescriptions/memed-mobile-context';
import { onRequest as middlewareOnRequest } from '@/middleware';

function createCookieJar() {
  const store = new Map<string, { value: string; options: Record<string, unknown> }>();
  return {
    store,
    astroCookies: {
      set(name: string, value: string, options: Record<string, unknown> = {}) {
        if (options.maxAge === 0 || value === '') {
          store.delete(name);
        } else {
          store.set(name, { value, options });
        }
      },
      get(name: string) {
        const entry = store.get(name);
        return entry ? { value: entry.value } : undefined;
      },
      delete(name: string) {
        store.delete(name);
      },
    },
    toCookieHeader() {
      return Array.from(store.entries())
        .map(([name, entry]) => `${name}=${entry.value}`)
        .join('; ');
    },
  };
}

function makeRuntimeLocals() {
  return {
    runtime: {
      env: {
        PUBLIC_SUPABASE_URL: 'https://qxjjrpksmwwrmubhvjew.supabase.co',
        PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
        MEMED_MOBILE_ENABLED: mocks.memedMobileEnabled,
        MEMED_RX_ENABLED: mocks.memedRxEnabled,
        MEMED_PILOT_DOCTOR_ID: DOCTOR_ID,
      },
    },
  };
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.handoffs.clear();
  mocks.nowMs = Date.now();
  mocks.memedMobileEnabled = 'true';
  mocks.memedRxEnabled = 'true';
  mocks.doctorActive = true;
  mocks.profileActive = true;
  mocks.profileRole = 'doctor';
  mocks.validLicense = true;
  mocks.appointmentRow = {
    doctor_id: DOCTOR_ID,
    patient_id: PATIENT_ID,
    status: 'in_progress',
    start_time: new Date(mocks.nowMs - 10 * 60_000).toISOString(),
    type: 'telemedicine',
  };
  mocks.resolveMemedPatient.mockResolvedValue({
    idExterno: PATIENT_ID,
    cpf: '52998224725',
  });

  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://qxjjrpksmwwrmubhvjew.supabase.co/auth/v1/user')) {
      const headers = new Headers(init?.headers);
      const authHeader = headers.get('authorization') ?? headers.get('Authorization') ?? '';
      if (!authHeader.startsWith('Bearer ') || authHeader.includes('invalid')) {
        return new Response(JSON.stringify({ message: 'invalid token' }), { status: 401 });
      }
      return new Response(
        JSON.stringify({
          id: DOCTOR_USER_ID,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'dr.brasil@autamedica.com',
          app_metadata: { role: 'doctor' },
          user_metadata: { role: 'doctor' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.startsWith('https://qxjjrpksmwwrmubhvjew.supabase.co/rest/v1/profiles')) {
      return new Response(
        JSON.stringify({ role: mocks.profileRole, active: mocks.profileActive }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify({ error: 'unexpected fetch in test' }), { status: 500 });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('validateMemedMobileNextPath allowlist', () => {
  it('accepts canonical appointmentId, requestId and patientId paths', () => {
    expect(
      validateMemedMobileNextPath(`/doctors/prescriptions/memed-mobile?appointmentId=${APPOINTMENT_ID}`),
    ).toBe(`/doctors/prescriptions/memed-mobile?appointmentId=${APPOINTMENT_ID}`);
    expect(
      validateMemedMobileNextPath(`/doctors/prescriptions/memed-mobile?requestId=${APPOINTMENT_ID}`),
    ).toBe(`/doctors/prescriptions/memed-mobile?requestId=${APPOINTMENT_ID}`);
    expect(
      validateMemedMobileNextPath(`/doctors/prescriptions/memed-mobile?patientId=${PATIENT_ID}`),
    ).toBe(`/doctors/prescriptions/memed-mobile?patientId=${PATIENT_ID}`);
  });

  it('rejects open redirects, extra params, fragments and invalid UUIDs', () => {
    const malicious = [
      'https://evil.example/doctors/prescriptions/memed-mobile?appointmentId=' + APPOINTMENT_ID,
      '//evil.example/doctors/prescriptions/memed-mobile?appointmentId=' + APPOINTMENT_ID,
      '/doctors/prescriptions/memed-mobile?appointmentId=' + APPOINTMENT_ID + '&next=//evil.com',
      '/doctors/prescriptions/memed-mobile?appointmentId=' + APPOINTMENT_ID + '#access_token=abc',
      '/doctors/prescriptions/memed-mobile?appointmentId=not-a-uuid',
      '/admin?appointmentId=' + APPOINTMENT_ID,
      '/auth/login?returnTo=/doctors',
    ];
    for (const candidate of malicious) {
      expect(validateMemedMobileNextPath(candidate)).toBeNull();
    }
  });
});

describe('Memed mobile server-side session handoff & middleware E2E', () => {
  it('exchanges opaque code into real chunked @supabase/ssr cookies and passes middleware + memed-mobile-context without 302 to /auth/login', async () => {
    // Pad claim to exceed @supabase/ssr 3180-byte cookie chunk threshold so chunking is exercised.
    const largeAccessToken = makeUnsignedJwt(DOCTOR_USER_ID, {
      padding: 'a'.repeat(3600),
    });
    const refreshToken = 'rt_opaque_valid_refresh_token_123';
    const nextPath = `/doctors/prescriptions/memed-mobile?appointmentId=${APPOINTMENT_ID}`;

    // 1. POST issues opaque single-use handoff code
    const postReq = new Request('https://doctor.autamedica.com/api/doctors/memed-mobile/session-exchange', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${largeAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refreshToken, next: nextPath }),
    });
    const postRes = await exchangePost({
      request: postReq,
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof exchangePost>[0]);

    expect(postRes.status).toBe(200);
    expect(postRes.headers.get('Cache-Control')).toContain('no-store');
    const postJson = (await postRes.json()) as {
      success: boolean;
      data: { code: string; exchangeUrl: string; expiresInSeconds: number };
    };
    expect(postJson.success).toBe(true);
    expect(isValidHandoffCode(postJson.data.code)).toBe(true);
    expect(postJson.data.code).not.toContain('.');
    expect(postJson.data.exchangeUrl).not.toContain(largeAccessToken);
    expect(postJson.data.exchangeUrl).not.toContain(refreshToken);

    // 2. Middleware allows GET /api/doctors/memed-mobile/session-exchange without redirecting to /auth/login or /auth/callback
    const exchangeGetReq = new Request(postJson.data.exchangeUrl, {
      method: 'GET',
      headers: { 'user-agent': 'AutaMedica-Android/1.0' },
    });
    const middlewareExchangeJar = createCookieJar();
    let passedThroughExchange = false;
    const middlewareExchangeRes = await (
      middlewareOnRequest as unknown as (
        ctx: Record<string, unknown>,
        next: () => Promise<Response>,
      ) => Promise<Response>
    )(
      {
        request: exchangeGetReq,
        cookies: middlewareExchangeJar.astroCookies,
        locals: makeRuntimeLocals(),
        redirect: (url: string, status = 302) =>
          new Response(null, { status, headers: { Location: url } }),
      },
      async () => {
        passedThroughExchange = true;
        return new Response('ok', { status: 200 });
      },
    );
    expect(passedThroughExchange).toBe(true);
    expect(middlewareExchangeRes.status).toBe(200);

    // 3. GET /session-exchange consumes code atomically, runs @supabase/ssr setSession, emits HttpOnly/Secure/SameSite=Lax chunked cookies, returns 302
    const webViewJar = createCookieJar();
    const getRes = await exchangeGet({
      request: exchangeGetReq,
      cookies: webViewJar.astroCookies,
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof exchangeGet>[0]);

    expect(getRes.status).toBe(302);
    expect(getRes.headers.get('Location')).toBe(`https://doctor.autamedica.com${nextPath}`);
    expect(getRes.headers.get('Cache-Control')).toContain('no-store');

    const cookieNames = Array.from(webViewJar.store.keys());
    expect(cookieNames.some((name) => name.startsWith('sb-'))).toBe(true);
    expect(cookieNames.some((name) => /\.0$/.test(name))).toBe(true);
    expect(cookieNames.some((name) => /\.1$/.test(name))).toBe(true);
    for (const [, entry] of webViewJar.store.entries()) {
      expect(entry.options.httpOnly).toBe(true);
      expect(entry.options.secure).toBe(true);
      expect(entry.options.sameSite).toBe('lax');
      expect(entry.options.path).toBe('/');
    }

    // 4. Middleware allows /doctors/prescriptions/memed-mobile with emitted SSR cookies (NO 302 to /auth/login)
    const portalReq = new Request(`https://doctor.autamedica.com${nextPath}`, {
      method: 'GET',
      headers: {
        cookie: webViewJar.toCookieHeader(),
        'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36',
      },
    });
    const portalMiddlewareJar = createCookieJar();
    let portalReachedPage = false;
    const portalRes = await (
      middlewareOnRequest as unknown as (
        ctx: Record<string, unknown>,
        next: () => Promise<Response>,
      ) => Promise<Response>
    )(
      {
        request: portalReq,
        cookies: portalMiddlewareJar.astroCookies,
        locals: makeRuntimeLocals(),
        redirect: (url: string, status = 302) =>
          new Response(null, { status, headers: { Location: url } }),
      },
      async () => {
        portalReachedPage = true;
        return new Response('<html>MemedMobileRoute</html>', { status: 200 });
      },
    );
    expect(portalReachedPage).toBe(true);
    expect(portalRes.status).toBe(200);

    // 5. /api/doctors/prescriptions/memed-mobile-context authorizes the doctor using the SSR cookies
    const contextReq = new Request(
      `https://doctor.autamedica.com/api/doctors/prescriptions/memed-mobile-context?appointmentId=${APPOINTMENT_ID}`,
      {
        method: 'GET',
        headers: {
          cookie: webViewJar.toCookieHeader(),
        },
      },
    );
    const contextRes = await contextGet({
      request: contextReq,
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof contextGet>[0]);
    expect(contextRes.status).toBe(200);
    const contextJson = (await contextRes.json()) as {
      success: boolean;
      data: { patientId: string };
    };
    expect(contextJson).toEqual({
      success: true,
      data: { patientId: PATIENT_ID },
    });

    // 6. Reusing the exact same code fails with 401 and emits zero cookies
    const reuseJar = createCookieJar();
    const reuseRes = await exchangeGet({
      request: new Request(postJson.data.exchangeUrl, { method: 'GET' }),
      cookies: reuseJar.astroCookies,
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof exchangeGet>[0]);
    expect(reuseRes.status).toBe(401);
    expect(reuseJar.store.size).toBe(0);
  });

  it('rejects expired codes, nonexistent codes, JWT-shaped codes, and malicious next params without setting cookies', async () => {
    const accessToken = makeUnsignedJwt(DOCTOR_USER_ID);
    const nextPath = `/doctors/prescriptions/memed-mobile?appointmentId=${APPOINTMENT_ID}`;

    const postRes = await exchangePost({
      request: new Request('https://doctor.autamedica.com/api/doctors/memed-mobile/session-exchange', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: 'rt_123', next: nextPath }),
      }),
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof exchangePost>[0]);
    const postJson = (await postRes.json()) as { data: { exchangeUrl: string } };

    // Expire the stored code
    mocks.nowMs += 60_000;
    const expiredJar = createCookieJar();
    const expiredRes = await exchangeGet({
      request: new Request(postJson.data.exchangeUrl, { method: 'GET' }),
      cookies: expiredJar.astroCookies,
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof exchangeGet>[0]);
    expect(expiredRes.status).toBe(401);
    expect(expiredJar.store.size).toBe(0);

    // Nonexistent opaque code
    const missingJar = createCookieJar();
    const missingUrl = `https://doctor.autamedica.com/api/doctors/memed-mobile/session-exchange?code=${'a'.repeat(43)}&next=${encodeURIComponent(nextPath)}`;
    const missingRes = await exchangeGet({
      request: new Request(missingUrl, { method: 'GET' }),
      cookies: missingJar.astroCookies,
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof exchangeGet>[0]);
    expect(missingRes.status).toBe(401);
    expect(missingJar.store.size).toBe(0);

    // JWT passed as code
    const jwtJar = createCookieJar();
    const jwtUrl = `https://doctor.autamedica.com/api/doctors/memed-mobile/session-exchange?code=${encodeURIComponent(accessToken)}&next=${encodeURIComponent(nextPath)}`;
    const jwtRes = await exchangeGet({
      request: new Request(jwtUrl, { method: 'GET' }),
      cookies: jwtJar.astroCookies,
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof exchangeGet>[0]);
    expect(jwtRes.status).toBe(401);
    expect(jwtJar.store.size).toBe(0);

    // Malicious next redirect
    const evilJar = createCookieJar();
    const evilUrl = `https://doctor.autamedica.com/api/doctors/memed-mobile/session-exchange?code=${'b'.repeat(43)}&next=${encodeURIComponent('https://evil.example/phish')}`;
    const evilRes = await exchangeGet({
      request: new Request(evilUrl, { method: 'GET' }),
      cookies: evilJar.astroCookies,
      locals: makeRuntimeLocals(),
    } as unknown as Parameters<typeof exchangeGet>[0]);
    expect(evilRes.status).toBe(400);
    expect(evilJar.store.size).toBe(0);
  });

  it('keeps /doctors/prescriptions/memed-mobile protected by middleware when unauthenticated (302 to /auth/login)', async () => {
    const unauthReq = new Request(
      `https://doctor.autamedica.com/doctors/prescriptions/memed-mobile?appointmentId=${APPOINTMENT_ID}`,
      {
        method: 'GET',
        headers: { 'user-agent': 'Mozilla/5.0' },
      },
    );
    const jar = createCookieJar();
    let reachedNext = false;
    const res = await (
      middlewareOnRequest as unknown as (
        ctx: Record<string, unknown>,
        next: () => Promise<Response>,
      ) => Promise<Response>
    )(
      {
        request: unauthReq,
        cookies: jar.astroCookies,
        locals: makeRuntimeLocals(),
        redirect: (url: string, status = 302) =>
          new Response(null, { status, headers: { Location: url } }),
      },
      async () => {
        reachedNext = true;
        return new Response('ok');
      },
    );
    expect(reachedNext).toBe(false);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toContain('/auth/login');
  });
});
