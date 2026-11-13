/**
 * Preparation of a remote-signature authorization session.
 *
 * No HTTP route invokes this yet. Integrator authorization, immutable PDF
 * storage and a transactional request adapter are mandatory before enabling.
 * Each physician authorizes their own signature in FirmAR.
 */
import { validateDoctorCuil } from '../firmar-remote-client';
import type { FirmarSignRequest, FirmarSigningSession } from '../firmar-remote-client';

export interface FirmArEligibleDraft {
  certificateId: string;
  doctorId: string;
  countryCode: string;
  status: string;
  pdfBytes: Uint8Array;
}

export interface FirmArDoctorEnrollment {
  doctorId: string;
  cuil: string;
  verificationStatus: 'pending' | 'verified' | 'rejected' | 'revoked';
}

export interface FirmArReservation {
  certificateId: string;
  doctorId: string;
  signerCuil: string;
  originalPdfSha256: string;
  tokenHash: string;
  expiresAt: string;
}

export interface FirmArSessionStore {
  /**
   * Must freeze PDF bytes in private storage and atomically reserve exactly
   * one open signing request for this certificate; refuse duplicates.
   */
  reserveAndFreeze(data: FirmArReservation, bytes: Uint8Array): Promise<boolean>;
  markAwaitingAuthorization(tokenHash: string, authorizationUrl: string): Promise<void>;
  markFailed(tokenHash: string): Promise<void>;
}

export interface FirmArSigningGateway {
  createSigningSession(input: FirmarSignRequest): Promise<FirmarSigningSession>;
}

async function digestSha256(bytes: Uint8Array): Promise<string> {
  const stable = Uint8Array.from(bytes);
  const result = await crypto.subtle.digest('SHA-256', stable.buffer);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const token = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(token, v => v.toString(16).padStart(2, '0')).join('');
}

export async function prepareFirmArSigningSession(input: {
  integrationEnabled: boolean;
  integrationApproved: boolean;
  authenticatedDoctorId: string;
  draft: FirmArEligibleDraft;
  enrollment: FirmArDoctorEnrollment;
  returnUrl: string;
  store: FirmArSessionStore;
  gateway: FirmArSigningGateway;
  now?: Date;
}): Promise<FirmarSigningSession> {
  // Both release gates are server-controlled; never derive them from the UI.
  if (!input.integrationEnabled || !input.integrationApproved) {
    throw new Error('firmar_integration_not_approved');
  }
  if (input.draft.doctorId !== input.authenticatedDoctorId ||
      input.enrollment.doctorId !== input.authenticatedDoctorId) {
    throw new Error('firmar_doctor_draft_mismatch');
  }
  if (input.draft.countryCode !== 'AR' || input.draft.status !== 'draft') {
    throw new Error('firmar_certificate_not_signable');
  }
  if (input.enrollment.verificationStatus !== 'verified') {
    throw new Error('firmar_doctor_not_enrolled');
  }
  const cuil = validateDoctorCuil(input.enrollment.cuil);
  const pdfBytes = input.draft.pdfBytes;
  if (pdfBytes.byteLength < 5 || pdfBytes.byteLength > 8 * 1024 * 1024 ||
      new TextDecoder().decode(pdfBytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error('firmar_document_not_pdf');
  }
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error('firmar_invalid_timestamp');

  const token = randomToken();
  const reservation: FirmArReservation = {
    certificateId: input.draft.certificateId,
    doctorId: input.authenticatedDoctorId,
    signerCuil: cuil,
    originalPdfSha256: await digestSha256(pdfBytes),
    tokenHash: await digestSha256(new TextEncoder().encode(token)),
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
  };

  if (!await input.store.reserveAndFreeze(reservation, pdfBytes)) {
    throw new Error('firmar_duplicate_pending_request');
  }
  try {
    const result = await input.gateway.createSigningSession({
      doctorCuil: cuil,
      pdfBytes,
      requestToken: token,
      returnUrl: input.returnUrl,
    });
    if (result.status !== 'awaiting_doctor_authorization') {
      throw new Error('firmar_invalid_gateway_status');
    }
    await input.store.markAwaitingAuthorization(reservation.tokenHash, result.authorizationUrl);
    return result;
  } catch (error) {
    try {
      await input.store.markFailed(reservation.tokenHash);
    } catch {
      // Preserve the original failure. DB reconciliation must expire orphan
      // reservations so they cannot be replayed.
    }
    throw error;
  }
}
