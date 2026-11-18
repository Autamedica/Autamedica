import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isPublicCertificateReference, loadPublicDocumentVerification } from './public-document-verification';

const reference = 'AR-CERT-19A8B2-ABC123';
const pdf = new TextEncoder().encode('%PDF-1.7\nAutaMedica test bytes\n%%EOF');
async function hash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}
function query(data: unknown) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({ data, error: null }));
  return builder;
}

describe('public document verification', () => {
  it('accepts native certificate CUIR references, not arbitrary route text', () => {
    expect(isPublicCertificateReference(reference)).toBe(true);
    expect(isPublicCertificateReference('DOC-' + 'A'.repeat(32))).toBe(false);
    expect(isPublicCertificateReference('../medical_certificates')).toBe(false);
  });

  it('verifies only a signed certificate whose private PDF matches the issuance hash', async () => {
    const pdfHash = await hash(pdf);
    const queries: Record<string, unknown> = {
      medical_certificates: query({
        id: 'certificate-uuid', doctor_id: 'doctor-uuid', country_code: 'AR',
        created_at: '2026-11-18T10:00:00Z', status: 'signed',
        signature_method: 'electronic_verified', signature_hash: pdfHash,
        signed_pdf_url: `certificates/electronic/certificate-uuid/${pdfHash}.pdf`,
        signature_verified_at: '2026-11-18T10:05:00Z', cuir: reference,
      }),
      medical_certificate_electronic_issuances: query({ pdf_hash: pdfHash }),
      doctors: query({
        user_id: 'doctor-user', license_number: 'MN 12345', license_type: 'MN',
        enrollment_jurisdiction: 'CABA', uf_brazil: null,
      }),
      profiles: query({ first_name: 'Ana', last_name: 'Médica' }),
    };
    const download = vi.fn(async () => ({ data: new Blob([pdf]), error: null }));
    const admin = {
      from: vi.fn((table: string) => queries[table]),
      storage: { from: vi.fn(() => ({ download })) },
    };

    const result = await loadPublicDocumentVerification(admin as unknown as SupabaseClient, reference);
    expect(result).toMatchObject({
      reference, status: 'registered', pdfSha256: pdfHash,
      signatureType: 'electronic_verified',
      issuer: { name: 'Ana Médica', license: 'MN: MN 12345', jurisdiction: 'CABA' },
    });
    expect(download).toHaveBeenCalledWith(`certificates/electronic/certificate-uuid/${pdfHash}.pdf`);
    expect(JSON.stringify(result)).not.toContain('patient');
  });

  it('fails closed when signed PDF bytes differ from the recorded issuance hash', async () => {
    const recordedHash = 'a'.repeat(64);
    const queries: Record<string, unknown> = {
      medical_certificates: query({
        id: 'certificate-uuid', doctor_id: 'doctor-uuid', country_code: 'AR',
        created_at: '2026-11-18T10:00:00Z', status: 'signed',
        signature_method: 'electronic_verified', signature_hash: recordedHash,
        signed_pdf_url: `certificates/electronic/certificate-uuid/${recordedHash}.pdf`,
        signature_verified_at: '2026-11-18T10:05:00Z', cuir: reference,
      }),
      medical_certificate_electronic_issuances: query({ pdf_hash: recordedHash }),
    };
    const admin = {
      from: vi.fn((table: string) => queries[table]),
      storage: { from: vi.fn(() => ({ download: vi.fn(async () => ({ data: new Blob([pdf]), error: null })) })) },
    };
    await expect(loadPublicDocumentVerification(admin as unknown as SupabaseClient, reference)).resolves.toBeNull();
    expect(admin.from).not.toHaveBeenCalledWith('doctors');
  });
});
