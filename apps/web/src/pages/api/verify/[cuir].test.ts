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

  it('does not consider an unsigned certificate with a local QR and PDF valid', async () => {
    mocks.cert = {
      id: 'synthetic-certificate',
      cuir: 'TEST-DOCUMENT-CUIR',
      status: 'signed',
      signed_pdf_url: 'https://private.example.invalid/certificate.pdf',
      signature_verified_at: null,
      signature_hash: null,
      signature_method: 'electronic_simple',
      qr_code_content: 'LOCAL-QR-ONLY',
      patient_id: 'private-patient-uuid',
    };

    const result = await verify();
    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      valid: false,
      reason: 'certificate_not_verified',
      documentType: 'certificate',
      prescription: null,
      certificate: null,
    });
    expect(JSON.stringify(result.body)).not.toContain('private-patient-uuid');
    expect(mocks.from).not.toHaveBeenCalledWith('doctors');
    expect(mocks.from).not.toHaveBeenCalledWith('patients');
  });

  it('still recognises independently signed certificate records', async () => {
    mocks.cert = {
      id: 'synthetic-certificate',
      cuir: 'TEST-DOCUMENT-CUIR',
      status: 'signed',
      signed_pdf_url: 'https://private.example.invalid/certificate.pdf',
      signature_verified_at: '2026-11-06T12:00:00Z',
      signature_hash: 'test-sha256-hash',
      signature_method: 'ac_external',
      doctor_id: 'synthetic-doctor',
      certificate_type: 'constancia_atencion',
      country_code: 'AR',
      created_at: '2026-11-06T11:00:00Z',
      qr_code_content: 'SAFE-PUBLIC-VERIFY-CODE',
    };

    const result = await verify();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      valid: true,
      documentType: 'certificate',
      prescription: null,
      certificate: { cuir: 'TEST-DOCUMENT-CUIR', signatureMethod: 'ac_external', pdfUrl: null },
    });
    expect(JSON.stringify(result.body)).not.toContain('private.example.invalid');
  });

  it('returns invalid for missing prescriptions and certificates', async () => {
    const result = await verify();
    expect(result.body).toMatchObject({ valid: false, prescription: null, certificate: null });
  });
});
