export const MAX_CFM_EVIDENCE_BYTES = 10 * 1024 * 1024;

export const CFM_REVIEW_STATUSES = ['valid', 'pending'] as const;
export type CfmReviewStatus = (typeof CFM_REVIEW_STATUSES)[number];

export function validateCfmReviewInput(input: {
  status: unknown;
  reviewNotes: unknown;
  evidence: { type: string; size: number } | null;
}): string | null {
  if (typeof input.status !== 'string' || !CFM_REVIEW_STATUSES.includes(input.status as CfmReviewStatus)) {
    return 'status must be valid or pending';
  }

  if (typeof input.reviewNotes !== 'string' || input.reviewNotes.trim().length < 10) {
    return 'review notes must contain at least 10 characters';
  }
  if (input.reviewNotes.length > 2000) {
    return 'review notes must not exceed 2000 characters';
  }

  if (input.status === 'valid' && !input.evidence) {
    return 'evidence file is required to approve a CRM';
  }

  if (input.evidence) {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(input.evidence.type)) {
      return 'evidence must be a PDF, JPG or PNG file';
    }
    if (input.evidence.size <= 0 || input.evidence.size > MAX_CFM_EVIDENCE_BYTES) {
      return 'evidence file must be between 1 byte and 10 MB';
    }
  }

  return null;
}

export function isValidCfmEvidenceSignature(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === 'application/pdf') {
    return bytes.length >= 5 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
  }
  if (mimeType === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mimeType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return false;
}

export function cfmStatusToLicenseStatus(status: CfmReviewStatus): 'active' | 'inactive' {
  return status === 'valid' ? 'active' : 'inactive';
}

export function evidenceExtension(mimeType: string): 'pdf' | 'jpg' | 'png' | null {
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  return null;
}
