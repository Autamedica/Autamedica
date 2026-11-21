import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { regenerateIssuedPrescriptionPdf } from './issue-prescription.service';
import { FarmalinkClient } from './farmalink.client';
import * as pdf from './pdf-prescription.service';
import * as pdfSigner from './pdf-signer.service';
import * as certificates from '../doctors/services/certificate-query.service';
import {
  parseFarmalinkSnapshot,
  recoverFarmalinkPrescription,
  type FarmalinkSnapshot,
} from './farmalink.recovery.service';

const rx = 'bdbfd64b-4280-41b6-bb8c-630b09a0b9a5';
const actor = 'cac6f6b3-dc8a-4f4f-8833-45207e063f65';
const attempt = '55bb9df3-e203-42a7-bef4-8a0f9cfb53e2';
const cuir = '02680042020102000000000000000000000010101';

const validCert = {
  id: 'cert-1',
  doctorId: 'doctor',
  acProvider: 'encode_sa',
  signatureMethod: 'ac_external',
  certFingerprint: 'fp-123',
  certValidUntil: '2029-12-31T00:00:00Z',
  storagePath: 'certs/doctor.p12',
} as unknown as Awaited<ReturnType<typeof certificates.getActiveCertificate>>;

const snapshot: FarmalinkSnapshot = {
  version: 1,
  prescriptionId: rx,
  actorUserId: actor,
  doctorId: 'doctor',
  clinicalData: {},
  request: { fixture: true },
  dispensationOrder: {},
  pdfInput: {
    prescriptionId: rx,
    existingCuir: cuir,
    issuedAt: '2026-11-03T09:00:00Z',
    expiresAt: '2026-12-03T09:00:00Z',
    diagnosis: 'Control',
    medication: {
      genericName: 'AMOXICILINA',
      quantity: 1,
      dosage: '500mg',
      presentation: 'Comprimidos',
      instructions: 'Fixture',
    },
    patient: { name: 'Paciente Fixture', dni: '30123456' },
    prescriber: { name: 'Medico Fixture', license: '1234567' },
  },
};

function db(receipt: unknown, error: unknown = null) {
  const rpc = vi
    .fn()
    .mockResolvedValueOnce({ data: receipt, error })
    .mockResolvedValue({
      data: {
        artifact_path: 'canonical.pdf',
        cuir,
        vendor_id: '9600000002992',
        issued_at: snapshot.pdfInput.issuedAt,
        expires_at: snapshot.pdfInput.expiresAt,
      },
      error: null,
    });
  const upload = vi.fn().mockResolvedValue({ error: null });
  const signed = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://example.invalid/pdf' }, error: null });
  const storage = { from: vi.fn().mockReturnValue({ upload, createSignedUrl: signed }) };
  return { client: { rpc, storage } as unknown as SupabaseClient, rpc, upload, signed };
}

function mockSigningSuccess() {
  vi.spyOn(certificates, 'getActiveCertificate').mockResolvedValue(validCert);
  vi.spyOn(certificates, 'loadSigningCredentials').mockResolvedValue({
    p12Buffer: Buffer.from([1, 2, 3]),
    password: 'fixture-password',
  });
  vi.spyOn(pdfSigner, 'signPdfWithP12').mockResolvedValue({
    signedPdfBuffer: new Uint8Array([9, 8, 7, 6]),
  } as Awaited<ReturnType<typeof pdfSigner.signPdfWithP12>>);
}

describe('Farmalink receipt recovery without another alta', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects missing/invalid snapshots and different actors', () => {
    expect(parseFarmalinkSnapshot(null, rx, actor)).toBeNull();
    expect(parseFarmalinkSnapshot(snapshot, rx, 'other')).toBeNull();
    expect(
      parseFarmalinkSnapshot(
        { ...snapshot, pdfInput: { ...snapshot.pdfInput, expiresAt: '2025-01-01' } },
        rx,
        actor,
      ),
    ).toBeNull();
  });

  it('rebuilds from the retained CUIR and original dates, signs with PAdES, and atomically commits', async () => {
    const d = db({ attempt_id: attempt, vendor_id: '9600000002992', response_code: '00', snapshot, artifact_path: null });
    const alta = vi.spyOn(FarmalinkClient.prototype, 'altaReceta');
    const render = vi.spyOn(pdf, 'generatePrescriptionPdf').mockResolvedValue({
      cuir,
      pdfBuffer: new Uint8Array(4),
      pdfFilename: 'fixture.pdf',
      qrDataUrl: '',
      qrContent: 'fixture',
    });
    mockSigningSuccess();

    const result = await recoverFarmalinkPrescription(d.client, rx, actor);
    expect(result).toMatchObject({
      ok: true,
      data: { id: rx, status: 'active', cuir, issuedAt: snapshot.pdfInput.issuedAt, expiresAt: snapshot.pdfInput.expiresAt },
    });
    expect(render).toHaveBeenCalledWith(
      expect.objectContaining({
        existingCuir: cuir,
        issuedAt: snapshot.pdfInput.issuedAt,
        expiresAt: snapshot.pdfInput.expiresAt,
        externalPrescription: expect.objectContaining({ number: '9600000002992' }),
      }),
    );
    expect(d.rpc.mock.calls[1]).toEqual([
      'complete_farmalink_artifact',
      expect.objectContaining({ p_actor_user_id: actor, p_attempt_id: attempt, p_operation: 'recovery', p_signature_method: 'ac_external' }),
    ]);
    expect(alta).not.toHaveBeenCalled();
  });

  it('reuses an existing committed artifact without rendering or sending', async () => {
    const d = db({ attempt_id: attempt, vendor_id: '9600000002992', response_code: '00', snapshot, artifact_path: 'existing.pdf' });
    const render = vi.spyOn(pdf, 'generatePrescriptionPdf');
    expect(await recoverFarmalinkPrescription(d.client, rx, actor)).toMatchObject({ ok: true });
    expect(render).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });

  it.each([null, { state: 'unknown' }, { vendor_id: '9600000002992', response_code: '55', snapshot }])(
    'does not recover an unconfirmed result',
    async (receipt) => {
      const d = db(receipt);
      expect(await recoverFarmalinkPrescription(d.client, rx, actor)).toMatchObject({ ok: false });
      expect(d.upload).not.toHaveBeenCalled();
    },
  );

  it('refuses unsigned recovery when no eligible PAdES certificate is active', async () => {
    const d = db({ attempt_id: attempt, vendor_id: '9600000002992', response_code: '00', snapshot, artifact_path: null });
    vi.spyOn(certificates, 'getActiveCertificate').mockResolvedValue(null);
    const render = vi.spyOn(pdf, 'generatePrescriptionPdf');
    expect(await recoverFarmalinkPrescription(d.client, rx, actor)).toMatchObject({
      ok: false,
      error: 'digital_signature_required',
    });
    expect(render).not.toHaveBeenCalled();
    expect(d.upload).not.toHaveBeenCalled();
  });

  it('keeps the confirmed receipt protected when upload fails', async () => {
    const d = db({ attempt_id: attempt, vendor_id: '9600000002992', response_code: '00', snapshot });
    d.upload.mockResolvedValue({ error: { message: 'unavailable' } });
    vi.spyOn(pdf, 'generatePrescriptionPdf').mockResolvedValue({
      cuir,
      pdfBuffer: new Uint8Array(4),
      pdfFilename: 'fixture.pdf',
      qrDataUrl: '',
      qrContent: 'fixture',
    });
    mockSigningSuccess();
    expect(await recoverFarmalinkPrescription(d.client, rx, actor)).toMatchObject({ ok: false, error: 'pdf_upload_failed' });
    expect(d.rpc).toHaveBeenCalledTimes(1);
  });

  it('does not silently downgrade a failed certificate/signing lookup', async () => {
    const d = db({ attempt_id: attempt, vendor_id: '9600000002992', response_code: '00', snapshot });
    vi.spyOn(certificates, 'getActiveCertificate').mockRejectedValue(new Error('certificate unavailable'));
    expect(await recoverFarmalinkPrescription(d.client, rx, actor)).toMatchObject({
      ok: false,
      error: 'farmalink_recovery_failed',
    });
    expect(d.upload).not.toHaveBeenCalled();
  });

  it('keeps legacy regeneration fail-closed without verified signature', async () => {
    const d = db(null);
    expect(await regenerateIssuedPrescriptionPdf(d.client, rx, actor)).toMatchObject({
      ok: false,
      error: { code: 'reissue_requires_verified_signature' },
    });
  });
});
