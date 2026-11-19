import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: null as any,
  rpc: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  download: vi.fn(),
  doctor: null as any,
  profile: null as any,
  patient: null as any,
}));

vi.mock('@/lib/api-auth', () => ({
  withAuthRole: state.auth,
  isAuthed: (value: unknown) => !(value instanceof Response),
}));
vi.mock('@/lib/api-helpers', () => {
  const reply = (code: string, status: number) => new Response(JSON.stringify({ code }), { status });
  return {
    badRequest: (code: string) => reply(code, 400),
    forbidden: (code: string) => reply(code, 403),
    internalError: (code: string) => reply(code, 500),
    conflict: (code: string) => reply(code, 409),
    jsonOk: (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data }), { status }),
  };
});
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: () => state.admin }));
vi.mock('@/lib/doctors/services/certificate-electronic-assets', () => ({
  certificateAssetPath: (_value: string, _origin: string, _user: string, doctorId: string, type: string) =>
    `${doctorId}/${type}.png`,
  assertCertificateImage: vi.fn(),
}));
vi.mock('@autamedica/shared', () => ({
  logger: { error: vi.fn() },
}));

import { POST } from './document-archives';

const doctorUserId = '00000000-0000-4000-8000-000000000101';
const patientId = '00000000-0000-4000-8000-000000000202';
const reference = 'DOC-0123456789ABCDEF0123456789ABCDEF';
const patientDocument = '12345678901';

function queryFor(table: string) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({
      data: table === 'doctors' ? state.doctor
        : table === 'profiles' ? state.profile : state.patient,
      error: null,
    })),
  };
  return query;
}

function makeRequest(withPatient = true) {
  const form = new FormData();
  form.set('reference', reference);
  form.set('document_date', '2026-11-19');
  form.set('patient_name', 'Synthetic Patient');
  form.set('patient_document', patientDocument);
  if (withPatient) form.set('patient_id', patientId);
  form.set('document_type', 'Atestado');
  form.set('document_description', 'Synthetic document test');
  form.set(
    'authorization_statement',
    'Confirmo que emití este documento y autorizo su registro para verificación de integridad en AutaMedica.',
  );
  form.set('pdf', new File(['%PDF-1.7 synthetic document'], 'certificate.pdf', { type: 'application/pdf' }));
  return new Request('https://www.autamedica.com/api/doctors/document-archives', {
    method: 'POST',
    headers: { Origin: 'https://www.autamedica.com' },
    body: form,
  });
}

function invoke(withPatient = true) {
  return POST({
    request: makeRequest(withPatient),
    locals: { runtime: { env: { PUBLIC_SUPABASE_URL: 'https://qxjjrpksmwwrmubhvjew.supabase.co' } } },
  } as never);
}

describe('external medical document archive storage and patient link', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.auth.mockResolvedValue({ user: { id: doctorUserId } });
    state.doctor = {
      id: 'doctor-1', user_id: doctorUserId, active: true, care_country: 'BR',
      license_type: 'CRM', license_number: '12345', uf_brazil: 'RS',
      signature_image_url: 'signature', stamp_image_url: 'stamp',
    };
    state.profile = {
      first_name: 'Synthetic', last_name: 'Doctor', role: 'doctor', active: true, deleted_at: null,
    };
    state.patient = {
      id: patientId, care_country: 'BR', cpf: patientDocument, dni: null, active: true,
    };
    state.download.mockResolvedValue({ data: new Blob(['synthetic-image']), error: null });
    state.upload.mockResolvedValue({ data: { path: 'uploaded' }, error: null });
    state.remove.mockResolvedValue({ error: null });
    state.rpc.mockResolvedValue({ data: 'archive-1', error: null });
    state.admin = {
      from: (table: string) => queryFor(table),
      rpc: state.rpc,
      storage: {
        from: () => ({
          download: state.download,
          upload: state.upload,
          remove: state.remove,
        }),
      },
    };
  });

  it('stores the original PDF and atomically registers the archive plus verified patient link', async () => {
    const response = await invoke();
    expect(response.status).toBe(201);
    const wire = await response.json();
    expect(wire.data.patientLinked).toBe(true);
    expect(state.upload).toHaveBeenCalledOnce();
    const [storagePath, bytes, options] = state.upload.mock.calls[0];
    expect(storagePath).toMatch(/^document-archives\/DOC-[A-F0-9]{32}\/[a-f0-9]{64}\.pdf$/);
    expect(new TextDecoder().decode(bytes).startsWith('%PDF-')).toBe(true);
    expect(options).toEqual({ contentType: 'application/pdf', upsert: false });
    expect(state.rpc).toHaveBeenCalledWith('register_medical_document_archive', expect.objectContaining({
      p_doctor_id: 'doctor-1',
      p_patient_id: patientId,
      p_patient_document_number: patientDocument,
      p_reference: reference,
    }));
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('removes the uploaded original if the atomic archive/link transaction fails', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } });
    const response = await invoke();
    expect(response.status).toBe(409);
    expect(state.remove).toHaveBeenCalledWith([
      expect.stringMatching(/^document-archives\/DOC-[A-F0-9]{32}\/[a-f0-9]{64}\.pdf$/),
    ]);
  });

  it('rejects a requested patient link when the national document does not match', async () => {
    state.patient = { ...state.patient, cpf: '00000000000' };
    const response = await invoke();
    expect(response.status).toBe(403);
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
