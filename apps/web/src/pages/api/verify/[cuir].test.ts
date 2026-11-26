import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIRoute } from 'astro';

const mocks = vi.hoisted(() => ({
  rx: null as Record<string, unknown> | null,
  cert: null as Record<string, unknown> | null,
  from: vi.fn(),
  storageFrom: vi.fn(),
}));
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    from: mocks.from,
    storage: { from: mocks.storageFrom },
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

  it('fails closed if the CUIR row disappears before signature verification', async () => {
    mocks.rx = { id: 'legacy-test' };
    let lookupCount = 0;
    mocks.from.mockImplementation((_table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            lookupCount += 1;
            return { data: lookupCount === 1 ? mocks.rx : null, error: null };
          },
        }),
      }),
    }));
    const result = await verify();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      valid: false,
      reason: 'prescription_signature_unverified',
      prescription: null,
      certificate: null,
    });
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it('does not query patient or clinical_data for a public prescription lookup', async () => {
    mocks.rx = { id: 'legacy-test' };
    await verify();
    expect(mocks.from).toHaveBeenNthCalledWith(1, 'prescriptions');
    expect(mocks.from).toHaveBeenNthCalledWith(2, 'prescriptions');
    expect(mocks.from).toHaveBeenCalledTimes(2);
    expect(mocks.from).not.toHaveBeenCalledWith('patients');
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
      days_of_rest: 5,
      start_date: '2026-11-20',
      end_date: '2026-11-24',
    };

    const result = await verify();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      valid: true,
      documentType: 'certificate',
      prescription: null,
      certificate: { cuir: 'TEST-DOCUMENT-CUIR', signatureMethod: 'ac_external', pdfUrl: null, daysOfRest: 5, startDate: '2026-11-20', endDate: '2026-11-24', verificationStatus: 'valid' },
    });
    expect(JSON.stringify(result.body)).not.toContain('private.example.invalid');
    expect(JSON.stringify(result.body)).not.toContain('private-patient-uuid');
    expect(JSON.stringify(result.body)).not.toContain('diagnosis');
  });

  it('returns invalid for missing prescriptions and certificates', async () => {
    const result = await verify();
    expect(result.body).toMatchObject({ valid: false, prescription: null, certificate: null });
  });

  it('verifies an active AR electronic_simple prescription when governance audit evidence and PDF hash match without leaking PHI', async () => {
    const pdfBytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52]); // %PDF-1.4
    const digest = await crypto.subtle.digest('SHA-256', pdfBytes);
    const pdfHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    const pdfPath = `prescriptions/TEST-DOCUMENT-CUIR/${pdfHash}.pdf`;

    mocks.rx = {
      id: 'rx-ar-1',
      doctor_id: 'doc-1',
      patient_id: 'pat-private-uuid',
      status: 'active',
      cuir: 'TEST-DOCUMENT-CUIR',
      country_code: 'AR',
      signed_pdf_url: 'https://storage.example.invalid/signed.pdf',
      signature_method: 'electronic_simple',
      vendor_name: 'farmalink',
      vendor_id: '9600000002992',
      is_controlled_substance: false,
      created_at: '2026-11-26T10:00:00Z',
    };

    const sigEvent = {
      signature_hash: pdfHash,
      timestamp: '2026-11-26T10:01:00Z',
      metadata: { method: 'PAdES_GOVERNANCE_POLICY', document_hash: pdfHash },
    };
    const issueEvent = {
      signature_hash: pdfHash,
      metadata: { pdfPath, signature_hash: pdfHash },
    };

    mocks.storageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: { arrayBuffer: async () => pdfBytes.buffer },
        error: null,
      }),
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'prescriptions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: mocks.rx, error: null }) }),
          }),
        };
      }
      if (table === 'prescription_audit_events') {
        let requestedType = '';
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: (_col: string, val: unknown) => {
            if (val === 'ACT_DIGITAL_SIGNATURE' || val === 'issued') requestedType = String(val);
            return chain;
          },
          order: () => chain,
          limit: () => chain,
          maybeSingle: async () => ({
            data: requestedType === 'ACT_DIGITAL_SIGNATURE' ? sigEvent : issueEvent,
            error: null,
          }),
        };
        return chain;
      }
      if (table === 'doctors') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { user_id: 'doc-user', license_number: '12345', specialty: 'Clínica Médica', license_type: 'MN', uf_brazil: null },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { first_name: 'Ana', last_name: 'Pérez' }, error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });

    const result = await verify();
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      valid: true,
      documentType: 'prescription',
      prescription: {
        cuir: 'TEST-DOCUMENT-CUIR',
        status: 'active',
        countryCode: 'AR',
        signatureMethod: 'electronic_simple',
        patientName: 'Datos reservados',
        pdfUrl: null,
      },
      certificate: null,
    });
    expect(JSON.stringify(result.body)).not.toContain('pat-private-uuid');
  });
});
