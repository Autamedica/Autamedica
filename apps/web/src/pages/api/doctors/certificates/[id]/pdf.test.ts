import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  withAuth: vi.fn(),
  admin: null as any,
  certificate: null as any,
  doctor: null as any,
  patient: null as any,
  storageDownload: vi.fn(),
  createSignedUrl: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  withAuth: state.withAuth,
  isAuthed: (value: unknown) => !(value instanceof Response),
}));
vi.mock('@/lib/api-helpers', () => {
  const reply = (code: string, status: number) => new Response(JSON.stringify({ code }), { status });
  return {
    badRequest: (code: string) => reply(code, 400),
    forbidden: (code: string) => reply(code, 403),
    internalError: (code: string) => reply(code, 500),
    notFound: (code = 'not_found') => reply(code, 404),
    jsonOk: (data: unknown) => new Response(JSON.stringify({ success: true, data })),
  };
});
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: () => state.admin }));
vi.mock('@/lib/doctors/services/medical-certificate-pdf-context.service', () => ({
  loadMedicalCertificateForDoctor: vi.fn(),
}));
vi.mock('@/lib/doctors/services/pdf-medical-certificate.service', () => ({
  generateMedicalCertificatePdf: vi.fn(() => new Uint8Array([1, 2, 3])),
}));
vi.mock('@/lib/doctors/services/medical-certificate-verification', () => ({
  isMedicalCertificatePubliclyVerifiable: (row: Record<string, unknown>) =>
    row.status === 'signed' && Boolean(row.signed_pdf_url) &&
    Boolean(row.signature_verified_at) && Boolean(row.signature_hash) &&
    ['ac_external', 'electronic_verified'].includes(String(row.signature_method)),
}));
vi.mock('@/lib/doctors/services/certificate-electronic-assets', () => ({
  certificateSha256: vi.fn(async () => 'a'.repeat(64)),
}));
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }));

import { GET } from './pdf';

const certificateId = '00000000-0000-4000-8000-000000000001';
const patientUserId = '00000000-0000-4000-8000-000000000101';
const signedUrl = 'https://qxjjrpksmwwrmubhvjew.supabase.co/storage/v1/object/sign/medical-documents/certificates/signed/document.pdf?token=temporary';

function queryFor(table: string) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: table === 'medical_certificates' ? state.certificate
        : table === 'doctors' ? state.doctor : state.patient,
      error: null,
    })),
  };
  return query;
}

function invoke(token = 'native-patient-jwt') {
  return GET({
    params: { id: certificateId },
    locals: { runtime: { env: {} } },
    request: new Request(
      `https://www.autamedica.com/api/doctors/certificates/${certificateId}/pdf?downloadUrl=true`,
      { headers: { Authorization: `Bearer ${token}` } },
    ),
  } as never);
}

describe('certificate PDF download bearer session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.withAuth.mockResolvedValue(new Response(null, { status: 401 }));
    state.getUser.mockResolvedValue({
      data: { user: { id: patientUserId } },
      error: null,
    });
    state.certificate = {
      id: certificateId,
      doctor_id: 'doctor-1',
      patient_id: 'patient-1',
      status: 'signed',
      signed_pdf_url: `certificates/signed/${certificateId}.pdf`,
      signature_verified_at: '2026-11-19T12:00:00.000Z',
      signature_hash: 'a'.repeat(64),
      signature_method: 'ac_external',
    };
    state.doctor = { user_id: 'doctor-user', active: true };
    state.patient = { user_id: patientUserId };
    state.storageDownload.mockResolvedValue({ data: new Blob(['%PDF-1.7 synthetic']), error: null });
    state.createSignedUrl.mockResolvedValue({ data: { signedUrl }, error: null });
    state.admin = {
      auth: { getUser: state.getUser },
      from: (table: string) => queryFor(table),
      storage: {
        from: () => ({
          download: state.storageDownload,
          createSignedUrl: state.createSignedUrl,
        }),
      },
    };
  });

  it('authenticates a native patient bearer token and returns a short-lived URL only after ownership and hash checks', async () => {
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(state.getUser).toHaveBeenCalledWith('native-patient-jwt');
    expect(state.storageDownload).toHaveBeenCalledWith('certificates/signed/document.pdf');
    expect(state.createSignedUrl).toHaveBeenCalledWith('certificates/signed/document.pdf', 120);
    expect(await response.json()).toEqual({ success: true, data: { url: signedUrl } });
  });

  it('does not allow a bearer token belonging to another user to download the certificate', async () => {
    state.getUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000999' } },
      error: null,
    });
    const response = await invoke('another-patient-token');
    expect(response.status).toBe(404);
    expect(state.storageDownload).not.toHaveBeenCalled();
    expect(state.createSignedUrl).not.toHaveBeenCalled();
  });
});
