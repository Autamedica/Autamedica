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

interface PrescriptionRow {
  id: string;
  doctor_id: string;
  patient_id: string;
  appointment_id: string | null;
  organization_id: string;
  status: PrescriptionStatus;
  vendor_name: string;
  cuir: string | null;
  vendor_id: string | null;
  qr_code_content: string | null;
  signed_pdf_url: string | null;
  clinical_data: {
    items: IssuedPrescription['items'];
    diagnosis?: string;
    type: IssuedPrescription['type'];
    patient_cuil: string;
    prescriber_matricula: string;
    patient?: IssuedPrescription['patient'];
    prescriber?: IssuedPrescription['prescriber'];
    notes?: string;
  };
  created_at: string;
  updated_at: string;
}

function mapRowToIssuedPrescription(row: PrescriptionRow): IssuedPrescription {
  const iso = (s: string) => s as unknown as import('../../domain/models').ISODateString;
  return {
    id: row.id as unknown as PrescriptionId,
    cuir: row.cuir ?? '',
    status: row.status,
    issuedAt: iso(row.created_at),
    expiresAt: iso(row.updated_at),
    vendorName: row.vendor_name,
    vendorPrescriptionId: row.vendor_id ?? '',
    artifacts: {
      cuir: row.cuir ?? '',
      qrCodeContent: row.qr_code_content ?? '',
      signedPdfUrl: row.signed_pdf_url ?? undefined,
    },
    patient: row.clinical_data.patient ?? {
      patientId: row.patient_id as unknown as import('../../domain/models').PatientId,
      cuil: row.clinical_data.patient_cuil,
      dni: '' as unknown as import('../../domain/models').DNI,
      fullName: '',
    },
    prescriber: row.clinical_data.prescriber ?? {
      doctorId: row.doctor_id as unknown as import('../../domain/models').DoctorId,
      matriculaNumber: row.clinical_data.prescriber_matricula,
      matriculaType: 'MN',
      fullName: '',
    },
    appointmentId: row.appointment_id
      ? (row.appointment_id as unknown as import('../../domain/models').AppointmentId)
      : undefined,
    organizationId: row.organization_id as unknown as import('../../domain/models').OrganizationId,
    items: row.clinical_data.items,
    diagnosisCie10: row.clinical_data.diagnosis,
    type: row.clinical_data.type,
    notes: row.clinical_data.notes,
  };
}

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
          prescriber_matricula: draft.prescriber.matriculaNumber,
          patient: draft.patient,
          prescriber: draft.prescriber,
          notes: draft.notes,
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

  async findById(id: PrescriptionId): Promise<IssuedPrescription | null> {
    const { data, error } = await this.supabase
      .from('prescriptions')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('[SupabaseRepository] Failed to find by id', error);
      throw error;
    }
    if (!data) return null;
    return mapRowToIssuedPrescription(data as PrescriptionRow);
  }

  async listByPatient(patientId: string): Promise<IssuedPrescription[]> {
    const { data, error } = await this.supabase
      .from('prescriptions')
      .select('*')
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('[SupabaseRepository] Failed to list by patient', error);
      throw error;
    }
    return (data as PrescriptionRow[]).map(mapRowToIssuedPrescription);
  }

  async listByDoctor(doctorId: string): Promise<IssuedPrescription[]> {
    const { data, error } = await this.supabase
      .from('prescriptions')
      .select('*')
      .eq('doctor_id', doctorId)
      .order('created_at', { ascending: false });
    if (error) {
      logger.error('[SupabaseRepository] Failed to list by doctor', error);
      throw error;
    }
    return (data as PrescriptionRow[]).map(mapRowToIssuedPrescription);
  }

  async cancel(id: PrescriptionId, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from('prescriptions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) {
      logger.error('[SupabaseRepository] Failed to cancel prescription', error);
      throw error;
    }
    await this.logAuditEvent({
      prescriptionId: id,
      eventType: 'cancelled',
      userId: 'system',
      metadata: { reason },
    });
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
    return mapRowToIssuedPrescription(data as PrescriptionRow);
  }

  async updateStatus(id: PrescriptionId, status: PrescriptionStatus): Promise<void> {
    const { error } = await this.supabase
      .from('prescriptions')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) {
      logger.error('[SupabaseRepository] Failed to update status', error);
      throw error;
    }
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
