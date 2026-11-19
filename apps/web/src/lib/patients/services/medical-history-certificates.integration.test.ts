import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { medicalHistoryService } from './medical-history.service';
import { isMedicalCertificatePubliclyVerifiable } from '@/lib/doctors/services/medical-certificate-verification';

function createQueryChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'neq', 'in', 'is', 'order', 'limit', 'maybeSingle', 'single'];
  for (const method of methods) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve: (value: unknown) => void) => resolve(result);
  return chain;
}

describe('medicalHistoryService ↔ certificate PDF verification contract', () => {
  it('only exposes patient certificates that pass the same verification gate as /api/doctors/certificates/[id]/pdf', async () => {
    const validHash = 'a'.repeat(64);
    const verifiableCert = {
      id: '11111111-1111-4111-8111-111111111111',
      doctor_id: 'doc-1',
      patient_id: 'pat-1',
      cuir: 'CUIR-VALID-1',
      status: 'signed',
      certificate_type: 'reposo_laboral',
      days_of_rest: 2,
      start_date: '2026-11-19',
      end_date: '2026-11-21',
      diagnosis: 'Cuadro viral',
      observations: null,
      qr_code_content: 'https://autamedica.com/verify/CUIR-VALID-1',
      signed_pdf_url: `certificates/electronic/11111111-1111-4111-8111-111111111111/${validHash}.pdf`,
      country_code: 'AR',
      created_at: '2026-11-19T08:00:00.000Z',
      updated_at: '2026-11-19T08:00:00.000Z',
      signature_hash: validHash,
      signature_method: 'electronic_verified',
      signature_verified_at: '2026-11-19T08:00:00.000Z',
    };

    const legacyUnverifiedCert = {
      id: '22222222-2222-4222-8222-222222222222',
      doctor_id: 'doc-1',
      patient_id: 'pat-1',
      cuir: 'CUIR-LEGACY-2',
      status: 'signed',
      certificate_type: 'reposo_laboral',
      days_of_rest: 1,
      start_date: '2026-10-01',
      end_date: '2026-10-02',
      diagnosis: 'Histórico sin firma verificable',
      observations: null,
      qr_code_content: null,
      signed_pdf_url: 'certificates/signed/22222222-2222-4222-8222-222222222222.pdf',
      country_code: 'AR',
      created_at: '2026-10-01T08:00:00.000Z',
      updated_at: '2026-10-01T08:00:00.000Z',
      signature_hash: null,
      signature_method: null,
      signature_verified_at: null,
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'medical_certificates') {
          return createQueryChain({ data: [verifiableCert, legacyUnverifiedCert], error: null });
        }
        return createQueryChain({ data: [], error: null });
      }),
      rpc: vi.fn(async () => ({ data: [], error: null })),
    } as unknown as SupabaseClient;

    const snapshot = await medicalHistoryService.getFullHistory(supabase as never, 'pat-1', supabase);
    const returned = (snapshot as unknown as { certificates?: Array<Record<string, unknown>> }).certificates ?? [];

    expect(returned.length).toBeGreaterThan(0);
    for (const cert of returned) {
      expect(
        isMedicalCertificatePubliclyVerifiable(
          cert as unknown as Parameters<typeof isMedicalCertificatePubliclyVerifiable>[0],
        ),
      ).toBe(true);
    }
    expect(returned.map((c) => c.id)).toEqual([verifiableCert.id]);
  });
});
