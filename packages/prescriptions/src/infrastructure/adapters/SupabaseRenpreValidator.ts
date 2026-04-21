import type { SupabaseClient } from '@supabase/supabase-js';
import type { DoctorId } from '@autamedica/types';
import type {
  IRenpreValidator,
  RenpreRegistration,
  RenpreStatus,
  RenpreUploadInput,
} from '../../domain/renpre.ports';

interface RenpreRow {
  doctor_id: string;
  renpre_number: string;
  certificate_pdf_url: string | null;
  valid_from: string;
  valid_until: string;
  status: RenpreStatus;
  verified_at: string | null;
  verified_by_admin_id: string | null;
  rejection_reason: string | null;
}

function mapRow(row: RenpreRow): RenpreRegistration {
  return {
    doctorId: row.doctor_id as DoctorId,
    renpreNumber: row.renpre_number,
    certificatePdfUrl: row.certificate_pdf_url ?? undefined,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    status: row.status,
    verifiedAt: row.verified_at ?? undefined,
    verifiedByAdminId: row.verified_by_admin_id ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
  };
}

function isDateStillValid(date: string): boolean {
  return new Date(`${date}T23:59:59.999-03:00`).getTime() >= Date.now();
}

export class SupabaseRenpreValidator implements IRenpreValidator {
  constructor(private readonly supabase: SupabaseClient) {}

  async isVerified(doctorId: DoctorId): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('renpre_registrations')
      .select('status, valid_until')
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (error || !data) return false;
    if (data.status !== 'verified') return false;
    return isDateStillValid(data.valid_until);
  }

  async get(doctorId: DoctorId): Promise<RenpreRegistration | null> {
    const { data, error } = await this.supabase
      .from('renpre_registrations')
      .select('*')
      .eq('doctor_id', doctorId)
      .maybeSingle();

    if (error) throw new Error(`renpre get: ${error.message}`);
    return data ? mapRow(data as RenpreRow) : null;
  }

  async upsert(input: RenpreUploadInput): Promise<RenpreRegistration> {
    const { data, error } = await this.supabase
      .from('renpre_registrations')
      .upsert(
        {
          doctor_id: input.doctorId,
          renpre_number: input.renpreNumber,
          valid_from: input.validFrom,
          valid_until: input.validUntil,
          certificate_pdf_url: input.certificatePdfUrl ?? null,
          status: 'pending',
        },
        { onConflict: 'doctor_id' },
      )
      .select()
      .single();

    if (error || !data) throw new Error(`renpre upsert: ${error?.message ?? 'no data'}`);
    return mapRow(data as RenpreRow);
  }

  async markVerified(doctorId: DoctorId, adminId: string): Promise<void> {
    const { error } = await this.supabase
      .from('renpre_registrations')
      .update({
        status: 'verified',
        verified_at: new Date().toISOString(),
        verified_by_admin_id: adminId,
        rejection_reason: null,
      })
      .eq('doctor_id', doctorId);

    if (error) throw new Error(`renpre mark verified: ${error.message}`);
  }

  async markRejected(doctorId: DoctorId, adminId: string, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from('renpre_registrations')
      .update({
        status: 'rejected',
        verified_at: new Date().toISOString(),
        verified_by_admin_id: adminId,
        rejection_reason: reason,
      })
      .eq('doctor_id', doctorId);

    if (error) throw new Error(`renpre mark rejected: ${error.message}`);
  }
}
