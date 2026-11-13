/**
 * DEMO-only contract exercising the REAL AutaMedica Memed token and event routes,
 * real patient resolver and real MemedService parsing, with in-memory Supabase
 * and intercepted HTTP. No real clinicians, patients, prescriptions, signatures,
 * consent or Memed API calls are created. CPF/CRM are synthetic test fixtures.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIRoute } from 'astro';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  admin: vi.fn(),
  errors: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  DOCTOR_ROLES: ['doctor'],
  withAuthRole: mocks.auth,
  isAuthed: (response: unknown) => !(response instanceof Response),
}));
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: mocks.admin,
}));
vi.mock('@autamedica/shared', () => ({
  logger: { error: mocks.errors, warn: vi.fn(), info: vi.fn() },
}));

// Do not mock the route handlers, patient resolver or MemedService.
import { POST as tokenPOST } from '@/pages/api/doctors/prescriptions/memed-token';
import { POST as eventPOST } from '@/pages/api/doctors/prescriptions/memed-event';

const doctorId = '8b4cdcb2-4a12-4c02-a112-000000000001';
const patientId = '8b4cdcb2-4a12-4c02-a112-000000000002';
const doctorUserId = '8b4cdcb2-4a12-4c02-a112-000000000003';
const patientUserId = '8b4cdcb2-4a12-4c02-a112-000000000004';
const fakeDoctorCpf = '52998224725'; // test fixture only; never send to real provider
const fakePatientCpf = '11144477735'; // test fixture only; never send to real provider
const fakeCrm = '101010'; // not verified by CFM; simulated license row only
const fakeRx = 'DEMO-RX-001';

type Row = Record<string, unknown>;
const state = {
  doctor: {} as Row,
  patient: {} as Row,
  doctorProfile: {} as Row,
  patientProfile: {} as Row,
  license: {} as Row,
  careLink: true,
  providerDoctorCpf: fakeDoctorCpf,
  providerPatientCpf: fakePatientCpf,
  providerPatientExternalId: `autamedica-${patientId}`,
  providerSigned: true,
  providerDoctorExists: true,
  privateCpf: fakeDoctorCpf as string | null,
  rows: [] as Row[],
  requests: [] as string[],
};

function resetState() {
  state.doctor = {
    id: doctorId, user_id: doctorUserId, active: true, license_type: 'CRM',
    license_number: fakeCrm, uf_brazil: 'RS', cpf: null,
  };
  state.doctorProfile = {
    user_id: doctorUserId, first_name: 'Medico', last_name: 'Demonstração',
    email: 'medico-demo@example.invalid', phone: null, cpf: null,
  };
  state.patient = {
    id: patientId, user_id: patientUserId, active: true, care_country: 'BR',
    cpf: fakePatientCpf, birth_date: '2000-02-29', gender: 'female', lgpd_consent: true,
  };
  state.patientProfile = { user_id: patientUserId, first_name: 'Paciente', last_name: 'Demonstração' };
  state.license = {
    doctor_id: doctorId, license_number: fakeCrm, license_type: 'CRM',
    uf_brazil: 'RS', status: 'active', cfm_validation_status: 'valid',
    cfm_evidence_path: 'demo/license/cfm-proof.pdf',
    cfm_review_notes: 'Consulta CFM ficticia para pruebas automatizadas.',
    cfm_reviewed_by: 'demo-reviewer',
    cfm_reviewed_at: '2026-11-12T18:00:00.000Z',
    cfm_last_checked_at: '2026-11-12T18:00:00.000Z',
  };
  state.careLink = true;
  state.providerDoctorCpf = fakeDoctorCpf;
  state.providerPatientCpf = fakePatientCpf;
  state.providerPatientExternalId = `autamedica-${patientId}`;
  state.providerSigned = true;
  state.providerDoctorExists = true;
  state.privateCpf = fakeDoctorCpf;
  state.rows = [];
  state.requests = [];
}

function readTable(table: string, filters: Map<string, unknown>): Row | Row[] | null {
  switch (table) {
    case 'doctors':
      return filters.get('user_id') === doctorUserId ? state.doctor : null;
    case 'doctor_licenses':
      return state.license && state.license.doctor_id === filters.get('doctor_id') ? [state.license] : [];
    case 'profiles':
      return filters.get('user_id') === doctorUserId ? state.doctorProfile
        : filters.get('user_id') === patientUserId ? state.patientProfile : null;
    case 'memed_doctor_identities':
      return filters.get('doctor_id') === doctorId && state.privateCpf
        ? { cpf: state.privateCpf } : null;
    case 'patient_care_team':
      return state.careLink && filters.get('doctor_id') === doctorId
        && filters.get('patient_id') === patientId ? { id: 'demo-care-link' } : null;
    case 'appointments':
      return null;
    case 'patients':
      return filters.get('id') === patientId ? state.patient : null;
    case 'prescriptions':
      return state.rows.find(row => row.doctor_id === filters.get('doctor_id')
        && row.patient_id === filters.get('patient_id')
        && row.country_code === filters.get('country_code')
        && row.vendor_name === filters.get('vendor_name')) ?? null;
    default:
      throw new Error(`Unexpected query table in DEMO: ${table}`);
  }
}

function db() {
  return {
    from(table: string) {
      const filters = new Map<string, unknown>();
      const query = {
        select(_columns: string) { return query; },
        eq(key: string, value: unknown) { filters.set(key, value); return query; },
        is(_key: string, _value: unknown) { return query; },
        or(_expression: string) { return query; },
        limit(_n: number) { return query; },
        maybeSingle: async () => ({ data: Array.isArray(readTable(table, filters))
          ? (readTable(table, filters) as Row[])[0] ?? null : readTable(table, filters), error: null }),
        then: (accept: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
          Promise.resolve({ data: readTable(table, filters), error: null }).then(accept, reject),
        insert: async (row: Row) => {
          if (table !== 'prescriptions') throw new Error('Unexpected DEMO insert');
          state.rows.push(row);
          return { error: null };
        },
        upsert: async (row: Row) => {
          if (table !== 'memed_doctor_identities' || row.doctor_id !== doctorId) {
            throw new Error('Unexpected DEMO upsert');
          }
          state.privateCpf = String(row.cpf);
          return { error: null };
        },
      };
      return query;
    },
  };
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { 'Content-Type': 'application/vnd.api+json' },
  });
}
function mockedMemedFetch(input: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  const url = new URL(String(input));
  // No external requests: only the synthetic Memed contract routes are intercepted.
  expect(url.hostname).toBe('api.memed.com.br');
  state.requests.push(`${options?.method ?? 'GET'} ${url.pathname}`);
  if (url.pathname === `/v1/sinapse-prescricao/usuarios/${fakeDoctorCpf}`
    && (options?.method ?? 'GET') === 'GET') {
    if (!state.providerDoctorExists) return Promise.resolve(new Response(null, { status: 404 }));
    return Promise.resolve(json({ data: { attributes: {
      token: 'token-para-teste-apenas', external_id: doctorId,
      nome: 'Medico', sobrenome: 'Demonstração',
      cpf: state.providerDoctorCpf, crm: fakeCrm, uf: 'RS',
    } } }));
  }
  if (url.pathname === '/v1/sinapse-prescricao/usuarios' && options?.method === 'POST') {
    const payload = JSON.parse(String(options?.body ?? '{}')) as {
      data: { attributes: { cpf: string; data_nascimento: string; board: {
        board_code: string; board_number: string; board_state: string;
      }; external_id: string } } };
    expect(payload.data.attributes).toMatchObject({
      cpf: fakeDoctorCpf,
      data_nascimento: '25/07/1980',
      external_id: doctorId,
      board: { board_code: 'CRM', board_number: fakeCrm, board_state: 'RS' },
    });
    state.providerDoctorExists = true;
    return Promise.resolve(json({ data: { attributes: {
      token: 'token-para-teste-apenas', external_id: doctorId,
      nome: 'Medico', sobrenome: 'Demonstração',
      cpf: state.providerDoctorCpf, crm: fakeCrm, uf: 'RS',
    } } }));
  }
  if (url.pathname === `/v1/prescricoes/${fakeRx}`) {
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer token-para-teste-apenas' });
    return Promise.resolve(json({ data: { id: fakeRx, attributes: {
      id: fakeRx,
      medicos: { cpf: state.providerDoctorCpf, crm: fakeCrm, uf: 'RS' },
      paciente: {
        external_id: state.providerPatientExternalId, cpf: state.providerPatientCpf,
      },
      medicamentos: [{
        descricao: 'MEDICAMENTO DEMO - SEM VALIDADE',
        nome: 'PRODUTO FICTICIO',
        sanitized_posology: 'Somente para teste automatizado',
        quantidade: 1, receituario: 'SIMPLES',
      }],
      signed: state.providerSigned ? 1 : 0,
    } } }));
  }
  throw new Error(`Unexpected Memed call in DEMO: ${url.pathname}`);
}

function request(kind: 'token' | 'event', enabled: boolean, providedCpf?: string) {
  const route = kind === 'token' ? 'memed-token' : 'memed-event';
  const body = kind === 'token'
    ? { patientId, birthDate: '1980-07-25', ...(providedCpf ? { cpf: providedCpf } : {}) }
    : { action: 'issued', patientId, prescriptionId: fakeRx };
  return {
    request: new Request(`https://www.autamedica.com/api/doctors/prescriptions/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://www.autamedica.com' },
      body: JSON.stringify(body),
    }),
    locals: { runtime: { env: {
      MEMED_RX_ENABLED: enabled ? 'true' : 'false',
      MEMED_PILOT_DOCTOR_ID: doctorId,
      MEMED_API_KEY: 'DEMO_LOCAL_ONLY', MEMED_SECRET_KEY: 'DEMO_LOCAL_ONLY',
      MEMED_API_URL: 'https://api.memed.com.br/v1',
      MEMED_SCRIPT_URL: 'https://partners.memed.com.br/integration.js',
    } } },
  } as unknown as Parameters<APIRoute>[0];
}
async function callToken(enabled = true, providedCpf?: string) {
  const response = await tokenPOST(request('token', enabled, providedCpf));
  const wire = await response.json();
  return { status: response.status, data: wire.data, error: wire.error };
}
async function callEvent(enabled = true) {
  const response = await eventPOST(request('event', enabled));
  const wire = await response.json();
  return { status: response.status, data: wire.data, error: wire.error };
}

describe('Memed DEMO flow: synthetic doctor + synthetic patient, no real provider access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
    mocks.auth.mockResolvedValue({ user: { id: doctorUserId, email: 'medico-demo@example.invalid' } });
    mocks.admin.mockImplementation(db);
    vi.stubGlobal('fetch', vi.fn(mockedMemedFetch));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('accepts DEMO doctor + authorized BR patient, verifies mocked provider and records pending signature', async () => {
    const token = await callToken();
    expect(token.status).toBe(200);
    expect(token.data.patient).toMatchObject({
      idExterno: `autamedica-${patientId}`, nome: 'Paciente Demonstração',
      cpf: fakePatientCpf, sexo: 'Feminino', data_nascimento: '29/02/2000',
    });
    expect(token.data.token).toBe('token-para-teste-apenas');

    const event = await callEvent();
    expect(event.status).toBe(200);
    expect(event.data).toMatchObject({
      status: 'recorded_pending_signature_and_delivery', prescriptionId: fakeRx,
    });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      doctor_id: doctorId, patient_id: patientId, country_code: 'BR',
      status: 'draft', vendor_name: 'memed', vendor_id: fakeRx,
      clinical_data: {
        emission_status: 'provider_verified', signature_status: 'provider_reported_signed',
        signature_verified: false, delivery_status: 'pending', delivery_verified: false,
      },
    });
    expect(state.requests).toEqual([
      `GET /v1/sinapse-prescricao/usuarios/${fakeDoctorCpf}`,
      `GET /v1/sinapse-prescricao/usuarios/${fakeDoctorCpf}`,
      `GET /v1/prescricoes/${fakeRx}`,
    ]);
    const duplicate = await callEvent();
    expect(duplicate.status).toBe(200);
    expect(duplicate.data).toMatchObject({ duplicate: true, status: 'draft' });
    expect(state.rows).toHaveLength(1);
  });

  it('blocks both Memed routes when a legacy valid CRM has no manual review evidence', async () => {
    state.license.cfm_evidence_path = null;
    expect((await callToken()).status).toBe(403);
    expect((await callEvent()).status).toBe(403);
    expect(state.requests).toEqual([]);
    expect(state.rows).toHaveLength(0);
  });

  it('onboards a first-time DEMO doctor with DOB + CPF, then verifies a DEMO prescription event', async () => {
    state.privateCpf = null;
    state.providerDoctorExists = false;
    const token = await callToken(true, fakeDoctorCpf);
    expect(token.status).toBe(200);
    expect(state.privateCpf).toBe(fakeDoctorCpf);
    expect(state.providerDoctorExists).toBe(true);
    expect(state.requests).toEqual([
      `GET /v1/sinapse-prescricao/usuarios/${fakeDoctorCpf}`,
      'POST /v1/sinapse-prescricao/usuarios',
    ]);
    const event = await callEvent();
    expect(event.status).toBe(200);
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      status: 'draft',
      clinical_data: { signature_verified: false, delivery_verified: false },
    });
    expect(state.requests).toContain(`GET /v1/prescricoes/${fakeRx}`);
  });

  it('denies demo patient from Argentina before contacting Memed', async () => {
    state.patient.care_country = 'AR';
    expect((await callToken()).status).toBe(403);
    expect((await callEvent()).status).toBe(403);
    expect(state.requests).toEqual([]);
    expect(state.rows).toHaveLength(0);
  });

  it('denies absent or unconsented doctor-patient relationship', async () => {
    state.careLink = false;
    expect((await callToken()).status).toBe(403);
    expect((await callEvent()).status).toBe(403);
    expect(state.requests).toEqual([]);
    state.careLink = true;
    state.patient.lgpd_consent = false;
    expect((await callToken()).status).toBe(400);
    expect((await callEvent()).status).toBe(400);
    expect(state.requests).toEqual([]);
  });

  it('rejects a provider patient identity substitution without saving prescription', async () => {
    state.providerPatientCpf = fakeDoctorCpf;
    expect((await callEvent()).status).toBe(403);
    expect(state.rows).toHaveLength(0);
  });

  it('rejects provider doctor mismatch without saving prescription', async () => {
    state.providerDoctorCpf = fakePatientCpf;
    expect((await callEvent()).status).toBe(500);
    expect(state.rows).toHaveLength(0);
    expect(state.requests).not.toContain(`GET /v1/prescricoes/${fakeRx}`);
  });

  it('does not treat a provider signed flag as a verified signature', async () => {
    state.providerSigned = false;
    expect((await callEvent()).status).toBe(200);
    expect(state.rows[0].clinical_data).toMatchObject({
      signature_verified: false, signature_status: 'pending', delivery_verified: false,
    });
  });

  it('blocks both routes with the production issuance kill-switch off', async () => {
    expect((await callToken(false)).status).toBe(403);
    expect((await callEvent(false)).status).toBe(403);
    expect(state.requests).toEqual([]);
    expect(state.rows).toHaveLength(0);
  });
});
