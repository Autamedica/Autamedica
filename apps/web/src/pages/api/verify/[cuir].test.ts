import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIRoute } from 'astro';

const mocks = vi.hoisted(() => ({
  rx: null as Record<string, unknown> | null,
  cert: null as Record<string, unknown> | null,
  from: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    from: mocks.from,
  }),
}));
vi.mock('@autamedica/shared', () => ({
  logger: { error: vi.fn() },
}));
import { GET } from './[cuir]';

function prepareDb() {
  mocks.from.mockImplementation((table: string) => {
    const row = table === 'prescriptions' ? mocks.rx : mocks.cert;
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    };
  });
}
async function verify() {
  const response = await GET({
    params: { cuir: 'TEST-DOCUMENT-CUIR' },
    locals: { runtime: { env: {} } },
    request: new Request('https://autamedica.com/api/verify/TEST-DOCUMENT-CUIR'),
  } as unknown as Parameters<APIRoute>[0]);
  // jsonOk returns the standard { success:true, data:... } API envelope.
  const wire = await response.json();
  return { status: response.status, body: wire.data };
}

describe('public prescription verification must fail closed until trusted signing evidence exists', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rx = null;
    mocks.cert = null;
    prepareDb();
  });

  it.each(['sent', 'signed', 'dispensed_total', 'draft', 'cancelled'])(
    'does not treat an existing %s record with a CUIR and PDF as independently verified',
    async (status) => {
      mocks.rx = {
        id: 'legacy-test',
        status,
        cuir: 'TEST-DOCUMENT-CUIR',
        country_code: 'AR',
        signed_pdf_url: 'https://secret.example.invalid/opaque-access-url',
        patient_id: 'patient-uuid',
        clinical_data: { diagnosis: 'private-diagnosis', patientName: 'private-patient' },
        signature_method: 'electronic_simple',
      };
      const response = await verify();
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        valid: false,
        reason: 'prescription_signature_unverified',
        documentType: 'prescription',
        prescription: null,
        certificate: null,
      });
      const serialized = JSON.stringify(response.body);
      for (const privateField of ['private-diagnosis', 'private-patient', 'patient-uuid', 'secret.example.invalid']) {
        expect(serialized).not.toContain(privateField);
      }
      expect(mocks.from).toHaveBeenCalledWith('prescriptions');
      expect(mocks.from).not.toHaveBeenCalledWith('patients');
    },
  );

  it('does not query patient or clinical_data for a public prescription lookup', async () => {
    mocks.rx = { id: 'legacy-test' };
    await verify();
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it('returns invalid for missing prescriptions and certificates', async () => {
    const result = await verify();
    expect(result.body).toMatchObject({ valid: false, prescription: null, certificate: null });
  });
});
