import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isArchiveReference, publicArchiveRecord, loadPublicDocumentArchive } from './archive-verification';

const reference = `DOC-${'A'.repeat(32)}`;
const row = () => ({
  reference, status: 'registered', signature_type: 'scanned_signature',
  document_date: '2026-10-30', registered_at: '2026-10-30T20:00:00Z', pdf_sha256: 'a'.repeat(64),
  issuer_snapshot: { name: 'Professional', profession: 'Médico', license: 'MP 123', jurisdiction: 'Córdoba', email: 'private@example.test' },
  patient_snapshot: { name: 'Private patient', dni: 'private' },
  clinical_snapshot: { diagnosis: 'private' }, authorization_snapshot: { message: 'private' },
});

describe('administrative document archive verification', () => {
  it('rejects malformed and enumeratable references', () => {
    for (const value of ['DOC-1', '../records', reference.toLowerCase(), `${reference}\n`]) expect(isArchiveReference(value)).toBe(false);
    expect(isArchiveReference(reference)).toBe(true);
  });
  it('publishes registration without patient, clinical, contact or authorization data', () => {
    const result = publicArchiveRecord(row());
    expect(result).toMatchObject({ reference, status: 'registered', signatureType: 'scanned_signature' });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result).not.toHaveProperty('valid');
    expect(result).not.toHaveProperty('signatureVerified');
  });
  it('keeps a revoked registration visibly revoked', () => {
    expect(publicArchiveRecord({ ...row(), status: 'revoked' })?.status).toBe('revoked');
  });
  it('fails closed for missing issuer, hash and unsupported signature evidence', () => {
    for (const change of [{ issuer_snapshot: {} }, { pdf_sha256: '' }, { status: 'signed' },
      { signature_type: 'certified' }, { registered_at: 'invalid' }]) expect(publicArchiveRecord({ ...row(), ...change })).toBeNull();
  });
  it('does not query the database for an invalid reference', async () => {
    const from = vi.fn();
    expect(await loadPublicDocumentArchive({ from } as unknown as SupabaseClient, 'bad')).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
  it('preserves database failures instead of reporting a document as absent', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: { message: 'private db detail' } });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const from = vi.fn().mockReturnValue({ select });
    await expect(loadPublicDocumentArchive({ from } as unknown as SupabaseClient, reference)).rejects.toThrow('document_archive_lookup_failed');
    expect(select).toHaveBeenCalledWith('reference,status,document_date,registered_at,pdf_sha256,issuer_snapshot,signature_type');
  });
});
