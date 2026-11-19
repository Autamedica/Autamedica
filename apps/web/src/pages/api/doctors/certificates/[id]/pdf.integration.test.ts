import { describe, expect, it, vi, beforeEach } from 'vitest';
import { certificateSha256 } from '@/lib/doctors/services/certificate-electronic-assets';

const VALID_CERT_ID = '11111111-1111-4111-8111-111111111111';
const PDF_BYTES = new TextEncoder().encode('%PDF-1.7\n%autamedica-signed-test\n');

let currentUserId = 'user-patient-1';
let currentCert: Record<string, unknown> | null = null;
let currentDoctor: Record<string, unknown> | null = { user_id: 'user-doctor-1', active: true };
let currentPatient: Record<string, unknown> | null = { user_id: 'user-patient-1' };

vi.mock('@/lib/api-auth', () => ({
  withAuth: vi.fn(async () => ({ user: { id: currentUserId } })),
  isAuthed: () => true,
}));

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    storage: {
      from: () => ({
        download: vi.fn(async () => ({
          data: { arrayBuffer: async () => PDF_BYTES.buffer },
          error: null,
        })),
        createSignedUrl: vi.fn(async () => ({
          data: { signedUrl: 'https://storage.autamedica.test/signed-120s.pdf' },
          error: null,
        })),
      }),
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === 'medical_certificates') return { data: currentCert, error: null };
            if (table === 'doctors') return { data: currentDoctor, error: null };
            if (table === 'patients') return { data: currentPatient, error: null };
            return { data: null, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { GET } from './pdf';

describe('GET /api/doctors/certificates/[id]/pdf integration contract', () => {
  beforeEach(() => {
    currentUserId = 'user-patient-1';
    currentDoctor = { user_id: 'user-doctor-1', active: true };
    currentPatient = { user_id: 'user-patient-1' };
  });

  it('serves private PDF bytes and signed downloadUrl for a verified certificate owned by the patient', async () => {
    const hash = await certificateSha256(PDF_BYTES);
    currentCert = {
      id: VALID_CERT_ID,
      doctor_id: 'doc-1',
      patient_id: 'pat-1',
      status: 'signed',
      country_code: 'AR',
      signature_hash: hash,
      signature_method: 'electronic_verified',
      signature_verified_at: '2026-11-19T08:00:00.000Z',
      signed_pdf_url: `certificates/electronic/${VALID_CERT_ID}/${hash}.pdf`,
    };

    const pdfRes = await GET({
      request: new Request(`https://autamedica.com/api/doctors/certificates/${VALID_CERT_ID}/pdf`),
      params: { id: VALID_CERT_ID },
      locals: { runtime: { env: {} } },
    } as never);

    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers.get('Content-Type')).toBe('application/pdf');
    expect(pdfRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(pdfRes.headers.get('Cache-Control')).toContain('no-store');

    const urlRes = await GET({
      request: new Request(`https://autamedica.com/api/doctors/certificates/${VALID_CERT_ID}/pdf?downloadUrl=true`),
      params: { id: VALID_CERT_ID },
      locals: { runtime: { env: {} } },
    } as never);

    expect(urlRes.status).toBe(200);
    const body = (await urlRes.json()) as { data?: { url?: string }; url?: string };
    expect(body.data?.url ?? body.url).toBe('https://storage.autamedica.test/signed-120s.pdf');
  });

  it('rejects legacy signed certificates without cryptographic verification with 403', async () => {
    currentCert = {
      id: VALID_CERT_ID,
      doctor_id: 'doc-1',
      patient_id: 'pat-1',
      status: 'signed',
      country_code: 'AR',
      signature_hash: null,
      signature_method: null,
      signature_verified_at: null,
      signed_pdf_url: `certificates/signed/${VALID_CERT_ID}.pdf`,
    };

    const res = await GET({
      request: new Request(`https://autamedica.com/api/doctors/certificates/${VALID_CERT_ID}/pdf`),
      params: { id: VALID_CERT_ID },
      locals: { runtime: { env: {} } },
    } as never);

    expect(res.status).toBe(403);
  });

  it('blocks patients from previewing draft certificates and blocks unrelated users (cross-patient isolation)', async () => {
    currentCert = {
      id: VALID_CERT_ID,
      doctor_id: 'doc-1',
      patient_id: 'pat-1',
      status: 'draft',
      country_code: 'AR',
    };

    const draftRes = await GET({
      request: new Request(`https://autamedica.com/api/doctors/certificates/${VALID_CERT_ID}/pdf`),
      params: { id: VALID_CERT_ID },
      locals: { runtime: { env: {} } },
    } as never);
    expect(draftRes.status).toBe(404);

    currentUserId = 'user-other-patient';
    const crossPatientRes = await GET({
      request: new Request(`https://autamedica.com/api/doctors/certificates/${VALID_CERT_ID}/pdf`),
      params: { id: VALID_CERT_ID },
      locals: { runtime: { env: {} } },
    } as never);
    expect(crossPatientRes.status).toBe(404);
  });
});
