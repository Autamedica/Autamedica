import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const config = vi.hoisted(() => ({
  url: 'https://qxjjrpksmwwrmubhvjew.supabase.co',
  key: 'SYNTHETIC_SERVER_KEY',
}));

vi.mock('@/lib/runtime-env', () => ({
  resolveBusNonFhirApplicationName: () => undefined,
  resolveBusNonFhirPassword: () => undefined,
  resolveBusNonFhirDomainCode: () => undefined,
  resolvePublicSupabaseEnv: () => ({ publicSupabaseUrl: config.url, publicSupabaseAnonKey: 'not-used' }),
  resolveServiceRoleKey: () => config.key,
}));

import { fetchOfficialIdentity } from './non-fhir.service';

describe('RENAPER protected Supabase proxy (synthetic fixtures only)', () => {
  beforeEach(() => {
    config.url = 'https://qxjjrpksmwwrmubhvjew.supabase.co';
    config.key = 'SYNTHETIC_SERVER_KEY';
  });
  afterEach(() => vi.unstubAllGlobals());

  it('uses the existing active function when Cloudflare lacks BUS credentials', async () => {
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      success: true,
      data: {
        person: { numeroDocumento: '12345678', nombres: 'TEST', apellido: 'PATIENT', sexo: 'F' },
        coverages: [{ cobertura: 'SYNTHETIC COVERAGE' }],
      },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    const identity = await fetchOfficialIdentity({ dni: '12345678', sexId: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://qxjjrpksmwwrmubhvjew.supabase.co/functions/v1/patient-identity-renaper');
    expect(init?.method).toBe('POST');
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer SYNTHETIC_SERVER_KEY');
    expect(JSON.parse(String(init?.body))).toEqual({ dni: '12345678', sexId: 1 });
    expect(identity.person.numeroDocumento).toBe('12345678');
    expect(identity.coverages[0]?.cobertura).toBe('SYNTHETIC COVERAGE');
  });

  it('refuses to send privileged credentials to an alternate Supabase project', async () => {
    config.url = 'https://attacker-project.supabase.co';
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchOfficialIdentity({ dni: '12345678', sexId: 1 }))
      .rejects.toMatchObject({ code: 'BUS_NON_FHIR_SUPABASE_CREDENTIALS_MISSING' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not expose the remote error body or unauthorized code', async () => {
    const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
      success: false,
      code: 'UNAUTHORIZED',
      details: 'SENSITIVE INTERNAL DEBUG',
    }), { status: 401 }));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(fetchOfficialIdentity({ dni: '12345678', sexId: 1 }))
      .rejects.toMatchObject({ code: 'RENAPER_LOOKUP_FAILED', status: 401 });
  });
});
