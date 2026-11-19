import { describe, expect, it } from 'vitest';
import {
  cfmStatusToLicenseStatus,
  evidenceExtension,
  isValidCfmEvidenceSignature,
  MAX_CFM_EVIDENCE_BYTES,
  validateCfmReviewInput,
} from './cfm-manual-review';

describe('manual CFM review requirements', () => {
  it('requires documentary evidence and a review note before approval', () => {
    expect(validateCfmReviewInput({ status: 'valid', reviewNotes: 'Consultado no CRM', evidence: null }))
      .toBe('evidence file is required to approve a CRM');
    expect(validateCfmReviewInput({ status: 'valid', reviewNotes: 'curto', evidence: { type: 'application/pdf', size: 12 } }))
      .toBe('review notes must contain at least 10 characters');
  });

  it('limits review notes to 2000 characters', () => {
    expect(validateCfmReviewInput({
      status: 'pending',
      reviewNotes: 'x'.repeat(2001),
      evidence: null,
    })).toBe('review notes must not exceed 2000 characters');
  });

  it('accepts only supported evidence formats and a 10 MB maximum', () => {
    expect(validateCfmReviewInput({ status: 'valid', reviewNotes: 'Consulta no portal oficial', evidence: { type: 'application/pdf', size: 12 } })).toBeNull();
    expect(validateCfmReviewInput({ status: 'valid', reviewNotes: 'Documento conferido', evidence: { type: 'application/octet-stream', size: 12 } }))
      .toBe('evidence must be a PDF, JPG or PNG file');
    expect(validateCfmReviewInput({ status: 'valid', reviewNotes: 'Documento conferido', evidence: { type: 'image/png', size: MAX_CFM_EVIDENCE_BYTES + 1 } }))
      .toBe('evidence file must be between 1 byte and 10 MB');
  });

  it('checks file signatures instead of trusting the browser MIME type', () => {
    expect(isValidCfmEvidenceSignature('application/pdf', new TextEncoder().encode('%PDF-1.7'))).toBe(true);
    expect(isValidCfmEvidenceSignature('application/pdf', new TextEncoder().encode('not a PDF'))).toBe(false);
    expect(isValidCfmEvidenceSignature('image/jpeg', new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe(true);
    expect(isValidCfmEvidenceSignature('image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(true);
  });

  it('maps approval to an active license and pending review to inactive', () => {
    expect(cfmStatusToLicenseStatus('valid')).toBe('active');
    expect(cfmStatusToLicenseStatus('pending')).toBe('inactive');
    expect(evidenceExtension('application/pdf')).toBe('pdf');
    expect(evidenceExtension('image/jpeg')).toBe('jpg');
    expect(evidenceExtension('image/png')).toBe('png');
    expect(evidenceExtension('image/gif')).toBeNull();
  });
});
