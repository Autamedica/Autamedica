import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIRoute } from 'astro';

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  authorized: true,
  role: 'platform_admin',
  failed: '',
}));
vi.mock('@/lib/admin/auth', () => ({
  resolveAdminRole: async () => state.authorized ? state.role : null,
}));
vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    from(table: string) {
      let start = 0;
      let end = 999;
      const filters: ((row: Record<string, unknown>) => boolean)[] = [];
      const query = {
        select(_cols: string) { return query; },
        gte(field: string, date: string) {
          filters.push(row => String(row[field] ?? '') >= date); return query;
        },
        order(_field: string) { return query; },
        range(a: number, b: number) { start = a; end = b; return query; },
        then(resolve: (data: unknown) => unknown) {
          const rows = (state.tables[table] ?? []).filter(row => filters.every(predicate => predicate(row)));
          return Promise.resolve({
            data: rows.slice(start, end + 1),
            error: state.failed === table ? { message: 'test database failure' } : null,
          }).then(resolve);
        },
      };
      return query;
    },
  }),
}));
import { GET } from './executive-kpis';

const iso = new Date(Date.now() - 1000).toISOString();
async function run(country = 'BR', days = 30) {
  return GET({
    request: new Request(`https://admin.autamedica.com/api/admin/executive-kpis?country=${country}&days=${days}`),
    locals: { session: { user: { id: 'admin-id' } } },
  } as unknown as Parameters<APIRoute>[0]);
}
beforeEach(() => {
  state.tables = {};
  state.authorized = true;
  state.role = 'platform_admin';
  state.failed = '';
});

describe('executive admin KPIs', () => {
  it('blocks unauthenticated access without querying a protected table', async () => {
    state.authorized = false;
    expect((await run()).status).toBe(403);
  });
  it('prevents tenant admins from accessing platform-wide financial metrics', async () => {
    state.role = 'organization_admin';
    expect((await run()).status).toBe(403);
  });
  it('rejects country mixing and arbitrary time windows', async () => {
    expect((await run('ALL')).status).toBe(400);
    expect((await run('BR', 365)).status).toBe(400);
  });
  it('never places legacy countryless dispatches in Brasil', async () => {
    state.tables.pharmacy_dispatch_requests = [
      { id: 'older', care_country: null, status: 'completed', created_at: iso, call_started_at: iso, referral_partner_id: null },
      { id: 'ar', care_country: 'AR', status: 'expired', created_at: iso, referral_partner_id: null },
      { id: 'br', care_country: 'BR', status: 'completed', created_at: iso, call_started_at: iso, referral_partner_id: null },
    ];
    const result = await (await run()).json();
    expect(result.operational.requests).toBe(1);
    expect(result.quality.unattributed_country_requests).toBe(1);
    expect((await (await run('UNKNOWN')).json()).operational.requests).toBe(1);
    expect((await (await run('AR')).json()).operational.requests).toBe(1);
  });
  it('excludes drafts and counts one prescription-linked completed appointment only once', async () => {
    state.tables.patients = [{ id: 'patient-br', care_country: 'BR' }];
    state.tables.appointments = [{ id: 'a', patient_id: 'patient-br', status: 'completed', created_at: iso, deleted_at: null }];
    state.tables.prescriptions = [
      { id: 'draft', appointment_id: 'a', country_code: 'BR', status: 'draft', created_at: iso },
      { id: 'signed', appointment_id: 'a', country_code: 'BR', status: 'signed', created_at: iso },
      { id: 'sent', appointment_id: 'a', country_code: 'BR', status: 'sent', created_at: iso },
      { id: 'ar', appointment_id: 'a', country_code: 'AR', status: 'signed', created_at: iso },
    ];
    const body = await (await run()).json();
    expect(body.documents.prescriptions_total).toBe(3);
    expect(body.documents.prescriptions_draft).toBe(1);
    expect(body.documents.prescriptions_issued).toBe(2);
    expect(body.documents.completed_appointments_with_issued_prescription).toBe(1);
  });
  it('does not mix ARS with BRL and does not count pending payments as realized revenue', async () => {
    state.tables.patients = [{ id: 'p-br', care_country: 'BR' }, { id: 'p-ar', care_country: 'AR' }];
    state.tables.appointment_payments = [
      { id: 'br', patient_id: 'p-br', status: 'approved', currency: 'BRL', gross_amount: 7900, paid_at: iso, created_at: iso },
      { id: 'ar', patient_id: 'p-ar', status: 'approved', currency: 'ARS', gross_amount: 12000, paid_at: iso, created_at: iso },
      { id: 'pending', patient_id: 'p-br', status: 'pending', currency: 'BRL', gross_amount: 7900, paid_at: null, created_at: iso },
      { id: 'missing', patient_id: 'p-br', status: 'approved', currency: 'BRL', gross_amount: 1000, paid_at: null, created_at: iso },
    ];
    const br = await (await run()).json();
    expect(br.payments.approved_amount_by_currency).toEqual({ BRL: { count: 1, amount: 79 } });
    expect(br.payments.approved_without_paid_at).toBe(1);
    const ar = await (await run('AR')).json();
    expect(ar.payments.approved_amount_by_currency).toEqual({ ARS: { count: 1, amount: 120 } });
  });
  it('paginates historical patients and fails closed on database errors', async () => {
    state.tables.patients = Array.from({ length: 1804 }, (_, i) => ({ id: String(i), care_country: null }));
    const response = await run('UNKNOWN');
    expect(response.status).toBe(200);
    state.failed = 'patients';
    expect((await run()).status).toBe(500);
  });
});
