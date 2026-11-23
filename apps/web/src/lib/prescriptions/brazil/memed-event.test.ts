import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), patient: vi.fn(),
  token: vi.fn(), prescription: vi.fn(), digitalLink: vi.fn(), pdfUrl: vi.fn(), dispatchEncounter: vi.fn(), coreInsert: vi.fn(), memedInsert: vi.fn(), memedUpdate: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ DOCTOR_ROLES: ['doctor'], withAuthRole: mocks.auth,
  isAuthed: (result: unknown) => !(result instanceof Response) }));
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: mocks.admin }));
vi.mock('@/lib/prescriptions/brazil/memed-patient', async (original) => ({
  ...await original<typeof import('./memed-patient')>(),
  resolveMemedPatient: mocks.patient,
  assertMemedDispatchEncounter: mocks.dispatchEncounter,
}));
vi.mock('@/lib/prescriptions/brazil/memed.service', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/prescriptions/brazil/memed.service')>(),
  MemedService: class {
  getOrCreateDoctorToken = mocks.token;
  getIssuedPrescription = mocks.prescription;
  getDigitalPrescriptionLink = mocks.digitalLink;
  getFullPrescriptionDocumentUrl = mocks.pdfUrl;
} }));
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { POST } from '@/pages/api/doctors/prescriptions/memed-event';

const patientId = '11111111-1111-4111-8111-111111111111';
const doctor = { id: 'doctor', active: true, license_type: 'CRM', license_number: '9236',
  uf_brazil: 'RS', cpf: '52998224725' };
let rx: Record<string, unknown>;
let existing: unknown;
let existingMemed: unknown;
function context(prescriptionId = 'rx-test', enabled = 'true', requestId?: string): Parameters<typeof POST>[0] {
  return { request: new Request('https://www.autamedica.com/api/doctors/prescriptions/memed-event', {
    method: 'POST', body: JSON.stringify({ action: 'issued', patientId, prescriptionId, ...(requestId ? { requestId } : {}) }),
  }), locals: { runtime: { env: { MEMED_RX_ENABLED: enabled, MEMED_PILOT_DOCTOR_ID: 'doctor' } } } } as unknown as Parameters<typeof POST>[0];
}
beforeEach(() => {
  vi.clearAllMocks(); existing = null; existingMemed = null;
  mocks.digitalLink.mockResolvedValue({});
  mocks.pdfUrl.mockResolvedValue({});
  mocks.dispatchEncounter.mockResolvedValue(undefined);
  mocks.coreInsert.mockResolvedValue({ error: null });
  mocks.memedInsert.mockResolvedValue({ error: null });
  mocks.auth.mockResolvedValue({ user: { id: 'authenticated-doctor' } });
  mocks.patient.mockResolvedValue({ idExterno: `autamedica-${patientId}`, cpf: doctor.cpf });
  mocks.token.mockResolvedValue({ token: 'synthetic-token' });
  rx = { id: 'rx-test', medicos: { cpf: doctor.cpf, crm: '9236', uf: 'RS' },
    paciente: { external_id: `autamedica-${patientId}`, cpf: doctor.cpf }, medicamentos: [], signed: 0 };
  mocks.prescription.mockImplementation(async () => ({ data: { attributes: rx } }));
  mocks.coreInsert.mockResolvedValue({ error: null });
  mocks.admin.mockReturnValue({ from: (table: string) => {
    const rows: Record<string, unknown> = { doctors: doctor, prescriptions: existing, memed_prescriptions: existingMemed,
      profiles: { first_name: 'Synthetic', last_name: 'Doctor' },
      doctor_licenses: [{ license_number: '9236', uf_brazil: 'RS', cfm_evidence_path: 'ci/doctor/evidence.pdf', cfm_review_notes: 'Synthetic CI review evidence', cfm_reviewed_by: '00000000-0000-4000-8000-000000000001', cfm_reviewed_at: '2026-11-12T00:00:00Z', cfm_last_checked_at: '2026-11-12T00:00:00Z' }] };
    const updateQuery = { error: null, eq: vi.fn() };
    updateQuery.eq.mockReturnValue(updateQuery);
    const chain = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), or: vi.fn(),
      insert: table === 'memed_prescriptions' ? mocks.memedInsert : mocks.coreInsert,
      update: vi.fn((payload: unknown) => { mocks.memedUpdate(payload); return updateQuery; }),
      maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.or.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: rows[table], error: null });
    return chain;
  } });
});

describe('Memed event persistence boundary', () => {
  it.each([401, 403])('rejects authentication/role failure %s', async (status) => {
    mocks.auth.mockResolvedValue(new Response(null, { status }));
    expect((await POST(context())).status).toBe(status); expect(mocks.coreInsert).not.toHaveBeenCalled();
  });
  it('enforces the integration kill switch', async () => {
    expect((await POST(context('rx-test', 'false'))).status).toBe(403);
    expect(mocks.prescription).not.toHaveBeenCalled();
  });
  it('rejects manipulated ids before provider access', async () => {
    expect((await POST(context('../../other'))).status).toBe(400);
    expect(mocks.prescription).not.toHaveBeenCalled();
  });
  it.each(['id', 'paciente', 'medicos'])('rejects mismatched provider field %s', async (field) => {
    rx[field] = field === 'id' ? 'other-id' : {};
    expect((await POST(context())).status).toBe(403); expect(mocks.coreInsert).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 500])('does not persist after provider error %s', async (status) => {
    mocks.prescription.mockRejectedValue(new Error(`memed_prescription_verification_failed:${status}`));
    expect((await POST(context())).status).toBe(500); expect(mocks.coreInsert).not.toHaveBeenCalled();
  });
  it.each([0, 1])('records issuance without asserting signature or delivery (provider signed=%s)', async (signed) => {
    rx.signed = signed;
    expect((await POST(context())).status).toBe(200);
    expect(mocks.coreInsert.mock.calls[0][0]).toMatchObject({ status: 'draft', clinical_data: {
      signature_verified: false, delivery_verified: false, delivery_status: 'pending',
      signature_status: signed ? 'provider_reported_signed' : 'pending',
    } });
  });
  it('persists structured atestados and enables delivery only when Memed reports signing and returns the full PDF', async () => {
    rx = {
      id: 'rx-test',
      medicos: { cpf: doctor.cpf, crm: '9236', uf: 'RS' },
      paciente: { external_id: `autamedica-${patientId}`, cpf: doctor.cpf },
      medicamentos: [{
        tipo: 'custom',
        custom_categoria: 'atestado',
        nome: 'Atestado de afastamento',
        texto: 'Documento médico emitido pelo profissional',
      }],
      signed: 1,
    };
    mocks.pdfUrl.mockResolvedValue({
      data: { attributes: { url: 'https://documentos.memed.com.br/rx-test.pdf' } },
    });

    expect((await POST(context())).status).toBe(200);
    expect(mocks.memedInsert).toHaveBeenCalledWith(expect.objectContaining({
      provider_data: expect.objectContaining({
        document_type: 'atestado',
        has_atestado: true,
        provider_reported_signed: true,
        patient_delivery_eligible: true,
        structured_documents: [{
          tipo: 'custom',
          custom_categoria: 'atestado',
          nome: 'Atestado de afastamento',
          texto: 'Documento médico emitido pelo profissional',
        }],
      }),
      digital_link_data: expect.objectContaining({ pdf_url: 'https://documentos.memed.com.br/rx-test.pdf' }),
      pdf_signature_verified: false,
      patient_delivery_confirmed: false,
    }));
    expect(mocks.coreInsert.mock.calls[0][0]).toMatchObject({
      physical_pdf_url: 'https://documentos.memed.com.br/rx-test.pdf',
      clinical_data: {
        document_type: 'atestado',
        signature_status: 'provider_reported_signed',
        patient_delivery_eligible: true,
        delivery_status: 'provider_signed_pdf_available',
      },
    });
  });

  it('does not enable atestado delivery when the provider has not signed it', async () => {
    rx = {
      id: 'rx-test', medicos: { cpf: doctor.cpf, crm: '9236', uf: 'RS' },
      paciente: { external_id: `autamedica-${patientId}`, cpf: doctor.cpf },
      medicamentos: [{ tipo: 'custom', custom_categoria: 'atestado', nome: 'Atestado' }],
      signed: 0,
    };
    mocks.pdfUrl.mockResolvedValue({ data: { attributes: { url: 'https://documentos.memed.com.br/rx-test.pdf' } } });
    expect((await POST(context())).status).toBe(200);
    expect(mocks.memedInsert).toHaveBeenCalledWith(expect.objectContaining({
      provider_data: expect.objectContaining({ has_atestado: true, provider_reported_signed: false, patient_delivery_eligible: false }),
    }));
    expect(mocks.coreInsert.mock.calls[0][0].clinical_data).toMatchObject({
      signature_status: 'pending', patient_delivery_eligible: false, delivery_status: 'pending',
    });
  });

  it('does not enable atestado delivery when Memed reports signing without a full PDF', async () => {
    rx = {
      id: 'rx-test', medicos: { cpf: doctor.cpf, crm: '9236', uf: 'RS' },
      paciente: { external_id: `autamedica-${patientId}`, cpf: doctor.cpf },
      medicamentos: [{ tipo: 'custom', custom_categoria: 'atestado', nome: 'Atestado' }],
      signed: 1,
    };
    expect((await POST(context())).status).toBe(200);
    expect(mocks.memedInsert).toHaveBeenCalledWith(expect.objectContaining({
      provider_data: expect.objectContaining({ has_atestado: true, provider_reported_signed: true, patient_delivery_eligible: false }),
    }));
    expect(mocks.coreInsert.mock.calls[0][0].clinical_data).toMatchObject({
      signature_status: 'provider_reported_signed', patient_delivery_eligible: false, delivery_status: 'pending',
    });
  });

  it('keeps medication and atestado together in a mixed Memed event', async () => {
    rx = {
      id: 'rx-test', medicos: { cpf: doctor.cpf, crm: '9236', uf: 'RS' },
      paciente: { external_id: `autamedica-${patientId}`, cpf: doctor.cpf },
      medicamentos: [
        { tipo: 'medicamento', nome: 'Dipirona', descricao: 'Dipirona 500 mg', quantidade: 1 },
        { tipo: 'custom', custom_categoria: 'atestado', nome: 'Atestado de afastamento', texto: 'Dois dias' },
      ],
      signed: 1,
    };
    mocks.pdfUrl.mockResolvedValue({ data: { attributes: { url: 'https://documentos.memed.com.br/rx-test.pdf' } } });
    expect((await POST(context())).status).toBe(200);
    expect(mocks.memedInsert).toHaveBeenCalledWith(expect.objectContaining({
      provider_data: expect.objectContaining({
        document_type: 'atestado', has_atestado: true,
        medication_name: 'Dipirona 500 mg',
        medications: [expect.objectContaining({ commercial_name: 'Dipirona', tipo: 'medicamento' })],
        structured_documents: [expect.objectContaining({ custom_categoria: 'atestado' })],
        patient_delivery_eligible: true,
      }),
    }));
  });

  it('binds the issued prescription to the authenticated pharmacy dispatch', async () => {
    const requestId = '22222222-2222-4222-8222-222222222222';
    expect((await POST(context('rx-test', 'true', requestId))).status).toBe(200);
    expect(mocks.dispatchEncounter).toHaveBeenCalledWith(expect.anything(), 'doctor', patientId, requestId);
    expect(mocks.coreInsert.mock.calls[0][0].clinical_data).toMatchObject({
      dispatch_request_id: requestId,
    });
  });
  it('stores the patient digital link, unlock code and full PDF resource', async () => {
    mocks.digitalLink.mockResolvedValue({
      data: { attributes: { link: 'https://receita.memed.com.br/rx-test', password: 'LOCK-123' } },
    });
    mocks.pdfUrl.mockResolvedValue({
      data: { attributes: { url: 'https://documentos.memed.com.br/rx-test.pdf' } },
    });

    expect((await POST(context())).status).toBe(200);
    expect(mocks.memedInsert).toHaveBeenCalledWith(expect.objectContaining({
      status: 'verified_at_provider', pdf_signature_verified: false, patient_delivery_confirmed: false,
    }));
    expect(mocks.coreInsert.mock.calls[0][0]).toMatchObject({
      physical_pdf_url: 'https://documentos.memed.com.br/rx-test.pdf',
      clinical_data: {
        dispatch_request_id: null,
        memed_digital_prescription: {
          url: 'https://receita.memed.com.br/rx-test',
          unlock_code: 'LOCK-123',
        },
        memed_full_pdf_url: 'https://documentos.memed.com.br/rx-test.pdf',
        delivery_status: 'provider_link_available',
        signature_verified: false,
      },
    });
  });
  it('persists provider QR content in canonical and Memed read-model records without asserting signature or delivery', async () => {
    const qrCode = 'https://receita.memed.com.br/rx-test/qr';
    mocks.digitalLink.mockResolvedValue({
      data: { attributes: { qr_code: qrCode } },
    });

    expect((await POST(context())).status).toBe(200);
    expect(mocks.memedInsert).toHaveBeenCalledWith(expect.objectContaining({
      digital_link_data: expect.objectContaining({
        qr_code: qrCode,
        qr_code_content: qrCode,
      }),
      pdf_signature_verified: false,
      patient_delivery_confirmed: false,
    }));
    expect(mocks.coreInsert.mock.calls[0][0]).toMatchObject({
      qr_code_content: qrCode,
      clinical_data: {
        qr_code_content: qrCode,
        signature_verified: false,
        delivery_verified: false,
      },
    });
  });
  it('does not regress an existing prescription or discard links on duplicate callbacks', async () => {
    existingMemed = { id: 'memed-local-id', doctor_id: doctor.id, patient_id: patientId, memed_id: 'rx-test', status: 'verified_at_provider', digital_link_data: { url: 'https://receita.memed.com.br/old', unlock_code: 'OLD-CODE', pdf_url: 'https://documentos.memed.com.br/old.pdf', qr_code: 'https://receita.memed.com.br/old-qr', qr_code_content: 'https://receita.memed.com.br/old-qr' } };
    existing = {
      id: 'local-id',
      status: 'signed',
      physical_pdf_url: 'https://documentos.memed.com.br/old.pdf',
      clinical_data: {
        memed_digital_prescription: {
          url: 'https://receita.memed.com.br/old',
          unlock_code: 'OLD-CODE',
        },
        delivery_status: 'provider_link_available',
        qr_code_content: 'https://receita.memed.com.br/old-qr',
      },
      qr_code_content: 'https://receita.memed.com.br/old-qr',
    };
    const response = await POST(context());
    expect((await response.json()).data).toMatchObject({ status: 'signed', duplicate: true, documentAvailable: true });
    expect(mocks.coreInsert).not.toHaveBeenCalled();
    expect(mocks.memedInsert).not.toHaveBeenCalled();
    expect(mocks.memedUpdate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'verified_at_provider',
      digital_link_data: expect.objectContaining({
        url: 'https://receita.memed.com.br/old',
        unlock_code: 'OLD-CODE',
        pdf_url: 'https://documentos.memed.com.br/old.pdf',
        qr_code: 'https://receita.memed.com.br/old-qr',
        qr_code_content: 'https://receita.memed.com.br/old-qr',
      }),
      pdf_signature_verified: false,
      patient_delivery_confirmed: false,
    }));
    expect(mocks.memedUpdate).toHaveBeenCalledWith(expect.objectContaining({
      qr_code_content: 'https://receita.memed.com.br/old-qr',
    }));
  });
});
