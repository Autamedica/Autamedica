import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { createAstroAdminClient } from '@/lib/supabase';
import { forbidden, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers';
import type { PatientPrescriptionDTO } from '@/lib/doctors/types/prescription-core.dto';

interface ClinicalDataShape {
  medication_name?: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
  items?: Array<{
    generic_name?: string;
    dosage?: string;
    instructions?: string;
  }>;
  medications?: Array<{
    name?: string;
    dosage?: string;
    frequency?: string;
    instructions?: string;
  }>;
}

interface PrescriptionRow {
  id: string;
  status: string;
  cuir: string | null;
  signed_pdf_url: string | null;
  qr_code_content: string | null;
  clinical_data: unknown;
  doctor_id: string;
  patient_id: string;
  created_at: string;
}

function parseClinicalData(raw: unknown): ClinicalDataShape {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as ClinicalDataShape;
  }
  return {};
}

function mapRowToPatientDTO(row: PrescriptionRow, doctorName: string): PatientPrescriptionDTO {
  const clinical = parseClinicalData(row.clinical_data);
  const primaryMed = clinical.medications?.[0];
  const primaryItem = clinical.items?.[0];
  const isDigitalReady = Boolean(row.cuir && (row.qr_code_content || row.signed_pdf_url));

  return {
    id: row.id,
    medicationName:
      clinical.medication_name ??
      primaryMed?.name ??
      primaryItem?.generic_name ??
      'Prescripcion medica',
    dosage: clinical.dosage ?? primaryMed?.dosage ?? primaryItem?.dosage ?? '',
    frequency: clinical.frequency ?? primaryMed?.frequency ?? '',
    instructions: clinical.instructions ?? primaryMed?.instructions ?? primaryItem?.instructions ?? '',
    status: row.status,
    cuir: row.cuir,
    signedPdfUrl: row.signed_pdf_url,
    prescribedDate: row.created_at,
    expiresAt: null,
    doctorName,
    isDigitalReady,
  };
}

export const GET: APIRoute = async ({ request, params, locals }) => {
  const prescriptionId = params.id;
  if (!prescriptionId) return notFound('prescription_not_found');

  const context = await resolvePatientContext(request, locals);
  if (!context) return unauthorized();

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);

    const { data: row, error: rxError } = await admin
      .from('prescriptions')
      .select('id, status, cuir, signed_pdf_url, qr_code_content, clinical_data, doctor_id, patient_id, created_at')
      .eq('id', prescriptionId)
      .maybeSingle();

    if (rxError) {
      logger.error('[patients/prescriptions/id] query failed', rxError);
      return internalError();
    }

    if (!row) return notFound('prescription_not_found');
    if (row.patient_id !== context.patientId) return forbidden('prescription_not_yours');

    const { data: doctor } = await admin
      .from('doctors')
      .select('id, user_id')
      .eq('id', row.doctor_id)
      .maybeSingle();

    let doctorName = 'Medico';
    if (doctor?.user_id) {
      const { data: profile } = await admin
        .from('profiles')
        .select('first_name, last_name')
        .eq('user_id', doctor.user_id)
        .maybeSingle();

      if (profile) {
        doctorName = `Dr. ${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
      }
    }

    return jsonOk(mapRowToPatientDTO(row as PrescriptionRow, doctorName));
  } catch (err) {
    logger.error('[patients/prescriptions/id] GET error', err);
    return internalError();
  }
};
