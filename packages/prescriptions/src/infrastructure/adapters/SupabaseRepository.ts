import type { SupabaseClient } from '@supabase/supabase-js';
import type { 
  IPrescriptionRepository, 
  PrescriptionDraft, 
  IssuedPrescription,
  VendorIssuanceResult,
  PrescriptionId,
  PrescriptionStatus,
  PrescriptionAuditEvent
} from '../../domain/ports';
import { logger } from '@autamedica/shared';

export class SupabasePrescriptionRepository implements IPrescriptionRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async saveDraft(draft: PrescriptionDraft): Promise<PrescriptionId> {
    const { data, error } = await this.supabase
      .from('prescriptions')
      .insert({
        doctor_id: draft.prescriber.doctorId,
        patient_id: draft.patient.patientId,
        appointment_id: draft.appointmentId,
        organization_id: draft.organizationId,
        status: 'draft',
        vendor_name: 'pending',
        clinical_data: {
          items: draft.items,
          diagnosis: draft.diagnosisCie10,
          type: draft.type,
          patient_cuil: draft.patient.cuil,
          prescriber_matricula: draft.prescriber.matriculaNumber
        }
      })
      .select('id')
      .single();
    if (error) {
      logger.error('[SupabaseRepository] Failed to save draft', error);
      throw error;
    }
    return data.id as PrescriptionId;
  }

  async findById(_id: PrescriptionId): Promise<IssuedPrescription | null> {
    return null; 
  }

  async markAsIssued(id: PrescriptionId, result: VendorIssuanceResult): Promise<IssuedPrescription> {
    const { data, error } = await this.supabase
      .from('prescriptions')
      .update({
        status: 'sent',
        cuir: result.cuir,
        vendor_id: result.vendorPrescriptionId,
        qr_code_content: result.qrCodeContent,
        signed_pdf_url: result.signedPdfUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    if (error) {
      logger.error('[SupabaseRepository] Failed to mark as issued', error);
      throw error;
    }
    return data as unknown as IssuedPrescription;
  }

  async updateStatus(id: PrescriptionId, status: PrescriptionStatus): Promise<void> {
    await this.supabase.from('prescriptions').update({ status }).eq('id', id);
  }

  async logAuditEvent(event: Omit<PrescriptionAuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const { error } = await this.supabase
      .from('prescription_audit_events')
      .insert({
        prescription_id: event.prescriptionId,
        event_type: event.eventType,
        user_id: event.userId,
        ip_address: event.metadata.ipAddress,
        user_agent: event.metadata.userAgent,
        signature_hash: event.metadata.signatureHash
      });
    if (error) {
      logger.error('[SupabaseRepository] Failed to log audit event', error);
      throw error;
    }
  }
}
