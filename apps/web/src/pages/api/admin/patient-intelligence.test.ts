import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  fail: '',
}));
vi.mock('@autamedica/shared', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    rpc: async () => ({ data: [], error: null }),
    from(table: string) {
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      let first = 0;
      let last = 999;
      let count = false;
      const query = {
        select(_columns: string, options?: { count?: string }) { count = Boolean(options?.count); return query; },
        eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; },
        order() { return query; },
        range(a: number, b: number) { first = a; last = b; return query; },
        then(resolve: (result: unknown) => unknown) {
          const rows = (state.tables[table] ?? []).filter(row => filters.every(test => test(row)));
          return Promise.resolve({
            data: count ? null : rows.slice(first, last + 1), count: count ? rows.length : null,
            error: state.fail === table ? { message: 'query failed' } : null,
          }).then(resolve);
        },
      };
      return query;
    },
  }),
}));
import { GET as demographics } from './patient-demographics';
import { GET as clinical } from './clinical-intelligence';

async function request(handler: typeof demographics, authorized = true) {
  return handler({
    request: new Request('https://admin.autamedica.com/api/admin/patient-demographics'),
    locals: { session: { user: authorized ? { app_metadata: { role: 'platform_admin' } } : undefined } },
  } as unknown as Parameters<typeof handler>[0]);
}

beforeEach(() => { state.tables = {}; state.fail = ''; });

describe('patient intelligence endpoints', () => {
  it('replaces legacy particular defaults with independently classified coverage across all pages', async () => {
    state.tables.patients = Array.from({ length: 1804 }, (_, n) => ({
      active: true, user_id: n < 1693 ? String(n) : null,
      birth_date: n < 17 ? '1990-01-01' : null,
      address: n < 1054 ? 'Somewhere' : null, insurance_info: { has_paid: true },
    }));
    state.tables.v_patient_demographics = [{
      total_active_patients: 1804, gender: 'other', age_group: 'Desconocido',
      region: 'Sin especificar', insurance_name: 'Particular / Sin Obra Social', count: 1804,
    }];
    const response = await request(demographics);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.demographics.by_insurance).toEqual({ 'Cobertura desconocida': 1804 });
    expect(body.data_quality).toMatchObject({
      linked_records: 1693, unlinked_records: 111, with_birth_date: 17, with_address: 1054,
    });
  });
  it('rejects incomplete demographic distributions', async () => {
    state.tables.patients = [{ active: true }];
    expect((await request(demographics)).status).toBe(500);
  });
  it('uses actual extraction and observation counts, independently of the top-eight alarm list', async () => {
    state.tables.anamnesis_extractions = [{}, {}, {}];
    state.tables.clinical_symptom_observations = Array.from({ length: 12 }, (_, n) => ({
      symptom_name: `symptom${n}`, is_red_flag: n < 10,
      anamnesis_extraction_id: n < 6 ? 'one' : 'two',
    }));
    const response = await request(clinical);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.metrics).toEqual({
      extraction_records: 3, extractions_with_symptoms: 2,
      symptom_observations: 12, red_flag_observations: 10,
    });
    expect(body.data.red_flags_ranking).toHaveLength(8);
  });
  it('does not turn a failed count into a fabricated zero', async () => {
    state.fail = 'anamnesis_extractions';
    expect((await request(clinical)).status).toBe(503);
  });
  it('protects both endpoints from unauthenticated requests', async () => {
    expect((await request(demographics, false)).status).toBe(401);
    expect((await request(clinical, false)).status).toBe(401);
  });
});
