import { logger, domainEvents } from '@autamedica/shared';
import type { 
  PrescriptionDraft, 
  IssuedPrescription,
  IPrescriptionRepository,
  IPrescriptionVendor,
  IIdentityValidator
} from '../domain/ports';

export class IssuePrescriptionUseCase {
  constructor(
    private readonly repo: IPrescriptionRepository,
    private readonly vendor: IPrescriptionVendor,
    private readonly identity: IIdentityValidator
  ) {}

  async execute(draft: PrescriptionDraft, userId: string, context: { ip: string; ua: string }): Promise<IssuedPrescription> {
    try {
      logger.info(`[IssuePrescription] Starting issuance for patient ${draft.patient.cuil}`);
      const doctorStatus = await this.identity.validateDoctor(draft.prescriber.doctorId);
      if (!doctorStatus.active) throw new Error('Doctor not authorized');
      const patientStatus = await this.identity.validatePatient(draft.patient.cuil);
      if (!patientStatus.isValid) throw new Error('Patient CUIL not valid');
      const prescriptionId = await this.repo.saveDraft(draft);
      const result = await this.vendor.submit(draft);
      const issued = await this.repo.markAsIssued(prescriptionId, result);
      await this.repo.logAuditEvent({
        prescriptionId: issued.id,
        eventType: 'issued',
        userId,
        metadata: { ipAddress: context.ip, userAgent: context.ua, signatureHash: result.vendorPrescriptionId }
      });

      // Emitir evento para activation tracker (no bloqueante)
      void (async () => {
        try {
          await domainEvents.emit('prescription.issued', {
            prescriptionId: issued.id,
            patientId: draft.patient.patientId,
            doctorId: draft.prescriber.doctorId,
          })
        } catch (err: unknown) {
          logger.warn('[IssuePrescription] prescription.issued emit failed', err)
        }
      })()

      return issued;
    } catch (error) {
      logger.error('[IssuePrescription] Critical failure', error);
      throw error;
    }
  }
}
