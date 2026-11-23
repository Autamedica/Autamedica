import { describe, expect, it, vi, beforeEach } from 'vitest';

let sessionPatientId: string | null = 'pat-owner-1';
const queriedPatientIds: string[] = [];

vi.mock('@/lib/patients/api/patient-context', () => ({
  resolvePatientContext: vi.fn(async () =>
    sessionPatientId ? { patientId: sessionPatientId, userId: 'user-1' } : null,
  ),
}));

vi.mock('@/lib/supabase', () => ({
  createAstroAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: async (_col: string, val: string) => {
          queriedPatientIds.push(val);
          if (table === 'medical_document_archive_patient_links' && val === 'pat-owner-1') {
            return {
              data: [
                {
                  medical_document_archives: {
                    reference: 'DOC-0123456789ABCDEF0123456789ABCDEF',
                    status: 'registered',
                    document_date: '2026-11-19',
                    registered_at: '2026-11-19T12:00:00.000Z',
                    pdf_sha256: 'b'.repeat(64),
                    signature_type: 'scanned_signature',
                    issuer_snapshot: {
                      name: 'Dra. Ana Silva',
                      profession: 'Médico',
                      license: 'CRM: 123456',
                      jurisdiction: 'SP',
                    },
                  },
                },
              ],
              error: null,
            };
          }
          return { data: [], error: null };
        },
      }),
    }),
  }),
}));

import { GET } from './index';

describe('GET /api/patients/archived-documents integration contract', () => {
  beforeEach(() => {
    sessionPatientId = 'pat-owner-1';
    queriedPatientIds.length = 0;
  });

  it('derives patient_id strictly from session (ignoring query params) and returns private no-store archived documents', async () => {
    const res = await GET({
      request: new Request('https://autamedica.com/api/patients/archived-documents?patient_id=pat-other-999'),
      locals: { runtime: { env: {} } },
    } as never);

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(queriedPatientIds).toEqual(['pat-owner-1']);

    const body = (await res.json()) as { success: boolean; data: Array<{ reference: string; issuer: { license: string } }> };
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].reference).toBe('DOC-0123456789ABCDEF0123456789ABCDEF');
    expect(body.data[0].issuer.license).toBe('CRM: 123456');
  });

  it('returns 401 when unauthenticated', async () => {
    sessionPatientId = null;
    const res = await GET({
      request: new Request('https://autamedica.com/api/patients/archived-documents'),
      locals: { runtime: { env: {} } },
    } as never);

    expect(res.status).toBe(401);
  });
});
