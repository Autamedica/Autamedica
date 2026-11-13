import { describe, expect, it, vi } from 'vitest';
import { createFirmArSupabaseReceiptStore } from './firmar-supabase-receipt-store';

const certificateId = '00000000-0000-4000-8000-000000000001';
const pdf = new TextEncoder().encode('%PDF-1.7\nAuthenticated mock signed document');
const path = `certificates/signed/${certificateId}.pdf`;

function fixture(options: {
  uploadError?: boolean;
  savedBytes?: Uint8Array;
  downloadError?: boolean;
} = {}) {
  const upload = vi.fn(async () => ({
    error: options.uploadError ? { message: 'The resource already exists' } : null,
  }));
  const download = vi.fn(async () => ({
    data: options.downloadError ? null : new Blob([Uint8Array.from(options.savedBytes ?? pdf)]),
    error: options.downloadError ? { message: 'Not Found' } : null,
  }));
  const admin = {
    storage: {
      from: vi.fn(() => ({ upload, download })),
    },
  };
  return { store: createFirmArSupabaseReceiptStore(admin), upload, download };
}

describe('FirmAR signed-document storage safety', () => {
  it('stores the signed PDF in the private bucket without allowing overwrite', async () => {
    const { store, upload, download } = fixture();
    expect(await store.persistSignedPdf(certificateId, pdf)).toBe(path);
    expect(upload).toHaveBeenCalledWith(path, expect.any(Uint8Array),
      expect.objectContaining({ upsert: false, contentType: 'application/pdf' }));
    expect(download).not.toHaveBeenCalled();
  });

  it('accepts a retry only when the already-stored bytes match the signed PDF', async () => {
    const { store, download } = fixture({ uploadError: true, savedBytes: pdf });
    expect(await store.persistSignedPdf(certificateId, pdf)).toBe(path);
    expect(download).toHaveBeenCalledWith(path);
  });

  it('rejects a replay that attempts to replace another signed PDF', async () => {
    const { store } = fixture({
      uploadError: true,
      savedBytes: new TextEncoder().encode('%PDF-1.7\nDifferent signature'),
    });
    await expect(store.persistSignedPdf(certificateId, pdf))
      .rejects.toThrow('firmar_signed_pdf_conflict_integrity_mismatch');
  });

  it('rejects an upload error unless an identical private PDF can be read', async () => {
    const { store } = fixture({ uploadError: true, downloadError: true });
    await expect(store.persistSignedPdf(certificateId, pdf))
      .rejects.toThrow('firmar_signed_pdf_private_upload_failed');
  });
});
