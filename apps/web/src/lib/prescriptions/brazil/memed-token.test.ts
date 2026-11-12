import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), patient: vi.fn(), token: vi.fn() }));
vi.mock('@/lib/api-auth', () => ({ DOCTOR_ROLES: ['doctor'], withAuthRole: mocks.auth,
  isAuthed: (result: unknown) => !(result instanceof Response) }));
vi.mock('@/lib/supabase', () => ({ createAstroAdminClient: mocks.admin }));
vi.mock('@/lib/prescriptions/brazil/memed-patient', async (original) => ({
  ...await original<typeof import('./memed-patient')>(), resolveMemedPatient: mocks.patient,
}));
vi.mock('@/lib/prescriptions/brazil/memed.service', () => ({ MemedService: class {
  getOrCreateDoctorToken = mocks.token;
  getScriptUrl() { return 'https://partners.memed.com.br/integration.js'; }
} }));
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }));

vi.mock('@/lib/prescriptions/brazil/memed-identity.repository', () => ({
  getMemedDoctorCpf: vi.fn(async () => null), storeMemedDoctorCpf: vi.fn(async () => undefined),
}));

import { POST } from '@/pages/api/doctors/prescriptions/memed-token';

const doctor = { id: 'doctor', active: true, license_type: 'CRM', license_number: '9236',
  uf_brazil: 'RS', cpf: '52998224725' };
let rows: Record<string, unknown>;
function context(body: unknown = {}, enabled = 'true', origin?: string): Parameters<typeof POST>[0] {
  return { request: new Request('https://www.autamedica.com/api/doctors/prescriptions/memed-token', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify(body),
  }), locals: { runtime: { env: { MEMED_RX_ENABLED: enabled, MEMED_PILOT_DOCTOR_ID: 'doctor' } } } } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: 'authenticated-doctor' } });
  mocks.patient.mockResolvedValue({ idExterno: 'authorized-patient', cpf: '52998224725' });
  mocks.token.mockResolvedValue({ token: 'synthetic-token' });
  rows = { doctors: doctor, profiles: { first_name: 'Synthetic', last_name: 'Doctor' },
    doctor_licenses: [{ license_number: '9236', uf_brazil: 'RS', cfm_evidence_path: 'ci/doctor/evidence.pdf', cfm_review_notes: 'Synthetic CI review evidence', cfm_reviewed_by: '00000000-0000-4000-8000-000000000001', cfm_reviewed_at: '2026-11-12T00:00:00Z', cfm_last_checked_at: '2026-11-12T00:00:00Z' }] };
  mocks.admin.mockReturnValue({ from: (table: string) => {
    const chain = { select: vi.fn(), eq: vi.fn(), limit: vi.fn(),
      maybeSingle: vi.fn(async () => ({ data: rows[table], error: null })) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
    chain.limit.mockResolvedValue({ data: rows[table], error: null });
    return chain;
  } });
});

describe('Memed token boundary', () => {
  it.each([401, 403])('rejects authentication/role failure %s before reads', async (status) => {
    mocks.auth.mockResolvedValue(new Response(null, { status }));
    expect((await POST(context())).status).toBe(status);
    expect(mocks.admin).not.toHaveBeenCalled(); expect(mocks.token).not.toHaveBeenCalled();
  });
  it('enforces the kill switch', async () => {
    expect((await POST(context({}, 'false'))).status).toBe(403);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it('rejects cross-origin mutations', async () => {
    expect((await POST(context({}, 'true', 'https://other.example'))).status).toBe(403);
  });
  it('rejects a doctor outside the configured scope', async () => {
    rows.doctors = { ...doctor, id: 'another-doctor' };
    expect((await POST(context())).status).toBe(403);
  });
  it.each([{ cpf: '' }, { cpf: '00000000000' }, { license_number: '' }, { uf_brazil: 'XX' }])('rejects incomplete physician identity %j', async (change) => {
    rows.doctors = { ...doctor, ...change };
    rows.doctor_licenses = [{ license_number: change.license_number ?? '9236', uf_brazil: change.uf_brazil ?? 'RS' }];
    expect((await POST(context())).status).toBe(400);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it('rejects an unverified license', async () => {
    rows.doctor_licenses = [];
    expect((await POST(context())).status).toBe(403);
  });
  it('rejects a mathematically invalid submitted CPF', async () => {
    expect((await POST(context({ cpf: '52998224724' }))).status).toBe(400);
  });
  it('rejects a different submitted CPF', async () => {
    expect((await POST(context({ cpf: '11144477735' }))).status).toBe(403);
  });
  it('does not contact Memed for an unauthorized patient', async () => {
    mocks.patient.mockRejectedValue(new Error('doctor_patient_access_required'));
    expect((await POST(context({ patientId: 'unauthorized' }))).status).toBe(403);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it('requires complete patient data', async () => {
    mocks.patient.mockRejectedValue(new Error('memed_patient_identity_incomplete'));
    expect((await POST(context())).status).toBe(400);
    expect(mocks.token).not.toHaveBeenCalled();
  });
  it('returns backend patient identity with no-store token response', async () => {
    const response = await POST(context({ patientId: 'patient' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect((await response.json()).data.patient.idExterno).toBe('authorized-patient');
  });
});
