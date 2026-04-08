import type { IPrescriptionVendor, PrescriptionDraft, VendorIssuanceResult } from '../../domain/ports';
import { logger } from '@autamedica/shared';

export class RctaVendorAdapter implements IPrescriptionVendor {
  constructor(private readonly _apiKey: string, private readonly _baseUrl: string) {}

  async submit(prescription: PrescriptionDraft): Promise<VendorIssuanceResult> {
    logger.info(`[RctaVendor] Submitting for patient ${prescription.patient.cuil}`);
    return {
      cuir: `REC-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      vendorPrescriptionId: 'rcta-12345',
      qrCodeContent: 'https://api.rcta.com.ar/qr/placeholder',
      signedPdfUrl: 'https://api.rcta.com.ar/pdf/placeholder',
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  async cancel(cuir: string, reason: string) {
    logger.info(`[RctaVendor] Cancelling ${cuir}: ${reason}`);
    return true;
  }

  async checkStatus(cuir: string) {
    logger.info(`[RctaVendor] Checking ${cuir}`);
    return 'sent' as const;
  }
}
