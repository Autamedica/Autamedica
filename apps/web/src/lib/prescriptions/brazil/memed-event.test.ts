import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), patient: vi.fn(),
  token: vi.fn(), prescription: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ DOCTOR_ROLES: ['doctor'], withAuthRole: mocks.auth,
  isAuthed: (result: unknown) => !(result instanceof Response) }));
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: mocks.admin }));
vi.mock('@/lib/prescriptions/brazil/memed-patient', async (original) => ({
  ...await original<typeof import('./memed-patient')>(), resolveMemedPatient: mocks.patient,
}));
vi.mock('@/lib/prescriptions/brazil/memed.service', () => ({ MemedService: class {
  getOrCreateDoctorToken = mocks.token;
  getIssuedPrescription = mocks.prescription;
} }));
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }));
import { POST } from '@/pages/api/doctors/prescriptions/memed-event';

const patientId = '11111111-1111-4111-8111-111111111111';
const doctor = { id: 'doctor', active: true, license_type: 'CRM', license_number: '9236',
  uf_brazil: 'RS', cpf: '52998224725' };
let rx: Record<string, unknown>;
let existing: unknown;
function context(prescriptionId = 'rx-test', enabled = 'true'): Parameters<typeof POST>[0] {
  return { request: new Request('https://www.autamedica.com/api/doctors/prescriptions/memed-event', {
    method: 'POST', body: JSON.stringify({ action: 'issued', patientId, prescriptionId }),
  }), locals: { runtime: { env: { MEMED_RX_ENABLED: enabled, MEMED_PILOT_DOCTOR_ID: 'doctor' } } } } as unknown as Parameters<typeof POST>[0];
}
beforeEach(() => {
  vi.clearAllMocks(); existing = null;
  mocks.auth.mockResolvedValue({ user: { id: 'authenticated-doctor' } });
  mocks.patient.mockResolvedValue({ idExterno: `autamedica-${patientId}`, cpf: doctor.cpf });
  mocks.token.mockResolvedValue({ token: 'synthetic-token' });
  rx = { id: 'rx-test', medicos: { cpf: doctor.cpf, crm: '9236', uf: 'RS' },
    paciente: { external_id: `autamedica-${patientId}`, cpf: doctor.cpf }, medicamentos: [], signed: 0 };
  mocks.prescription.mockImplementation(async () => ({ data: { attributes: rx } }));
  mocks.insert.mockResolvedValue({ error: null });
  mocks.admin.mockReturnValue({ from: (table: string) => {
    const rows: Record<string, unknown> = { doctors: doctor, prescriptions: existing,
      profiles: { first_name: 'Synthetic', last_name: 'Doctor' },
      doctor_licenses: [{ license_number: '9236', uf_brazil: 'RS', cfm_evidence_path: 'ci/doctor/evidence.pdf', cfm_review_notes: 'Synthetic CI review evidence', cfm_reviewed_by: '00000000-0000-4000-8000-000000000001', cfm_reviewed_at: '2026-11-12T00:00:00Z', cfm_last_checked_at: '2026-11-12T00:00:00Z' }] };
    const chain = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(), or: vi.fn(), insert: mocks.insert,
      maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.or.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: rows[table], error: null });
    return chain;
  } });
});

describe('Memed event persistence boundary', () => {
  it.each([401, 403])('rejects authentication/role failure %s', async (status) => {
    mocks.auth.mockResolvedValue(new Response(null, { status }));
    expect((await POST(context())).status).toBe(status); expect(mocks.insert).not.toHaveBeenCalled();
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
    expect((await POST(context())).status).toBe(403); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 500])('does not persist after provider error %s', async (status) => {
    mocks.prescription.mockRejectedValue(new Error(`memed_prescription_verification_failed:${status}`));
    expect((await POST(context())).status).toBe(500); expect(mocks.insert).not.toHaveBeenCalled();
  });
  it.each([0, 1])('records issuance without asserting signature or delivery (provider signed=%s)', async (signed) => {
    rx.signed = signed;
    expect((await POST(context())).status).toBe(200);
    expect(mocks.insert.mock.calls[0][0]).toMatchObject({ status: 'draft', clinical_data: {
      signature_verified: false, delivery_verified: false, delivery_status: 'pending',
      signature_status: signed ? 'provider_reported_signed' : 'pending',
    } });
  });
  it('does not regress an existing prescription on duplicate callbacks', async () => {
    existing = { id: 'local-id', status: 'signed' };
    const response = await POST(context());
    expect((await response.json()).data).toMatchObject({ status: 'signed', duplicate: true });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
