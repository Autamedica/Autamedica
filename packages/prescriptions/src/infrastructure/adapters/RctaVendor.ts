import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { IPrescriptionVendor, PrescriptionDraft, CUIR, PrescriptionStatus, VendorIssuanceResult } from '../../domain/ports';
import { logger } from '@autamedica/shared';

const EXPIRY_DAYS_DEFAULT = 30;
const EXPIRY_DAYS_PSYCHOTROPIC = 10;
const EXPIRY_DAYS_NARCOTIC = 5;

const PSYCHOTROPIC_KEYWORDS = [
  'clonazepam', 'diazepam', 'lorazepam', 'alprazolam', 'midazolam',
  'zolpidem', 'zopiclona', 'pregabalina', 'gabapentina',
  'tramadol', 'codeína', 'codeina',
];

const NARCOTIC_KEYWORDS = [
  'morfina', 'fentanilo', 'fentanyl', 'metadona', 'oxicodona',
  'buprenorfina', 'metilfenidato', 'methylphenidate',
  'lisdexanfetamina', 'lisdexamfetamine', 'anfetamina', 'amphetamine',
];

function computeExpiryDays(items: PrescriptionDraft['items']): number {
  const allNames = items
    .map((i) => `${i.genericName} ${i.commercialName ?? ''}`.toLowerCase())
    .join(' ');

  if (NARCOTIC_KEYWORDS.some((kw) => allNames.includes(kw))) {
    return EXPIRY_DAYS_NARCOTIC;
  }
  if (PSYCHOTROPIC_KEYWORDS.some((kw) => allNames.includes(kw))) {
    return EXPIRY_DAYS_PSYCHOTROPIC;
  }
  return EXPIRY_DAYS_DEFAULT;
}

function generateCuir(prescription: PrescriptionDraft): CUIR {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');

  const firstItemIfa = prescription.items[0]?.genericName ?? 'unknown';
  const payload = [
    prescription.prescriber.doctorId,
    prescription.patient.patientId,
    firstItemIfa,
    now.toISOString(),
  ].join(':');

  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 8).toUpperCase();

  return `AR-${dateStr}-${hash}`;
}

export class RctaVendorAdapter implements IPrescriptionVendor {
  constructor(private readonly supabase: SupabaseClient) {}

  async submit(prescription: PrescriptionDraft): Promise<VendorIssuanceResult> {
    try {
      const cuir = generateCuir(prescription);
      const now = new Date();
      const expiryDays = computeExpiryDays(prescription.items);
      const expiresAt = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000);

      const vendorPrescriptionId = `rcta-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
      const qrCodeContent = `https://www.autamedica.com/verify/${cuir}`;

      logger.info(
        `[RctaVendor] Prescription issued — cuir=${cuir} patient=${prescription.patient.cuil} ` +
        `expiry=${expiryDays}d vendor=${vendorPrescriptionId}`
      );

      return {
        cuir,
        vendorPrescriptionId,
        qrCodeContent,
        signedPdfUrl: undefined,
        issuedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      logger.error('[RctaVendor] Failed to submit prescription', error);
      throw error;
    }
  }

  async cancel(cuir: CUIR, reason: string): Promise<boolean> {
    try {
      const { data: prescription, error: findError } = await this.supabase
        .from('prescriptions')
        .select('id, status')
        .eq('cuir', cuir)
        .maybeSingle();

      if (findError) {
        logger.error(`[RctaVendor] Failed to find prescription for cancellation: ${cuir}`, findError);
        throw findError;
      }

      if (!prescription) {
        logger.warn(`[RctaVendor] Prescription not found for cancellation: ${cuir}`);
        return false;
      }

      const { error: updateError } = await this.supabase
        .from('prescriptions')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('cuir', cuir);

      if (updateError) {
        logger.error(`[RctaVendor] Failed to cancel prescription: ${cuir}`, updateError);
        throw updateError;
      }

      const { error: auditError } = await this.supabase
        .from('prescription_audit_events')
        .insert({
          prescription_id: prescription.id,
          event_type: 'cancelled',
          user_id: 'system',
          metadata: { reason, cuir, cancelled_at: new Date().toISOString() },
        });

      if (auditError) {
        logger.error(`[RctaVendor] Failed to log cancellation audit event for ${cuir}`, auditError);
      }

      logger.info(`[RctaVendor] Prescription cancelled — cuir=${cuir} reason="${reason}"`);
      return true;
    } catch (error) {
      logger.error(`[RctaVendor] cancel failed for ${cuir}`, error);
      throw error;
    }
  }

  async checkStatus(cuir: CUIR): Promise<PrescriptionStatus> {
    try {
      const { data, error } = await this.supabase
        .from('prescriptions')
        .select('status')
        .eq('cuir', cuir)
        .maybeSingle();

      if (error) {
        logger.error(`[RctaVendor] Failed to check status for ${cuir}`, error);
        throw error;
      }

      if (!data) {
        logger.warn(`[RctaVendor] Prescription not found: ${cuir}`);
        return 'expired';
      }

      logger.info(`[RctaVendor] Status check — cuir=${cuir} status=${data.status}`);
      return data.status as PrescriptionStatus;
    } catch (error) {
      logger.error(`[RctaVendor] checkStatus failed for ${cuir}`, error);
      throw error;
    }
  }
}
