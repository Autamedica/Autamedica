import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api-auth', () => ({
  ADMIN_ROLES: ['admin', 'platform_admin'],
  isAuthed: (res: unknown) => Boolean(res && typeof res === 'object' && 'user' in res),
  withAuthRole: vi.fn(async () => ({ user: { id: 'admin-1' }, role: 'platform_admin' })),
}));

vi.mock('@/lib/prescriptions/brazil/memed-identity.repository', () => ({
  getMemedDoctorCpf: vi.fn(async () => '52998224725'),
}));

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: vi.fn(() => ({
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => {
          if (table === 'platform_operational_domains') {
            return Promise.resolve({ data: { clinical_status: 'pending_issuance' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return chain;
    },
  })),
}));

import { GET } from './memed-health';

function makeContext(env: Record<string, string | undefined>) {
  return {
    request: new Request('https://www.autamedica.com/api/admin/integrations/memed-health'),
    locals: { runtime: { env } },
  } as unknown as Parameters<typeof GET>[0];
}

describe('GET /api/admin/integrations/memed-health', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('accepts partner credentials on 200 usuarios lookup and returns real flags', async () => {
    globalThis.fetch = vi.fn(async (input, init) => {
      const url = String(input);
      expect(url).toContain('https://api.memed.com.br/v1/sinapse-prescricao/usuarios/autamedica-healthcheck-readonly');
      expect(init?.redirect).toBe('manual');
      return new Response(JSON.stringify({
        data: { type: 'usuarios', attributes: { nome: 'Test', token: 'tok' } },
      }), { status: 200, headers: { 'Content-Type': 'application/vnd.api+json' } });
    }) as typeof fetch;

    const response = await GET(makeContext({
      MEMED_API_KEY: 'key',
      MEMED_SECRET_KEY: 'secret',
      MEMED_API_URL: 'https://api.memed.com.br/v1',
      MEMED_SCRIPT_URL: 'https://partners.memed.com.br/integration.js',
      MEMED_RX_ENABLED: 'true',
      MEMED_MOBILE_ENABLED: 'true',
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.credentialsAccepted).toBe(true);
    expect(body.data.providerReachable).toBe(true);
    expect(body.data.flags.MEMED_RX_ENABLED).toBe(true);
    expect(body.data.effectiveFlags.MEMED_RX_ENABLED).toBe(true);
    expect(body.data.effectiveFlags.MEMED_MOBILE_ENABLED).toBe(true);
  });

  it('accepts partner credentials on 404 nenhum usuário encontrado', async () => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      errors: [{ detail: 'Nenhum usuário encontrado para o identificador informado' }],
    }), { status: 404, headers: { 'Content-Type': 'application/vnd.api+json' } })) as typeof fetch;

    const response = await GET(makeContext({
      MEMED_API_KEY: 'key',
      MEMED_SECRET_KEY: 'secret',
      MEMED_API_URL: 'https://api.memed.com.br/v1',
      MEMED_RX_ENABLED: 'false',
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.credentialsAccepted).toBe(true);
    expect(body.data.providerReachable).toBe(true);
    expect(body.data.flags.MEMED_RX_ENABLED).toBe(false);
    expect(body.data.effectiveFlags.MEMED_RX_ENABLED).toBe(false);
  });

  it('preserves real flags and returns 200 with providerReachable=false if Memed transport fails', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network timeout');
    }) as typeof fetch;

    const response = await GET(makeContext({
      MEMED_API_KEY: 'key',
      MEMED_SECRET_KEY: 'secret',
      MEMED_API_URL: 'https://api.memed.com.br/v1',
      MEMED_RX_ENABLED: 'true',
      MEMED_MOBILE_ENABLED: 'true',
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data.credentialsAccepted).toBe(false);
    expect(body.data.providerReachable).toBe(false);
    expect(body.data.flags.MEMED_RX_ENABLED).toBe(true);
    expect(body.data.flags.MEMED_MOBILE_ENABLED).toBe(true);
    expect(body.data.effectiveFlags.MEMED_RX_ENABLED).toBe(false);
  });
});
