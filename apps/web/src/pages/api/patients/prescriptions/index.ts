import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { resolvePatientContext } from '@/lib/patients/api/patient-context';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, unauthorized, internalError } from '@/lib/api-helpers';
import type { PatientPrescriptionDTO } from '@/lib/doctors/types/prescription-core.dto';

interface ClinicalDataShape {
  medication_name?: string;
  dosage?: string;
  frequency?: string;
  instructions?: string;
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
  created_at: string;
  updated_at: string;
}

function parseClinicalData(raw: unknown): ClinicalDataShape {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as ClinicalDataShape;
  }
  return {};
}

function mapRowToPatientDTO(
  row: PrescriptionRow,
  doctorName: string,
): PatientPrescriptionDTO {
  const clinical = parseClinicalData(row.clinical_data);
  const primaryMed = clinical.medications?.[0];
  const isDigitalReady = Boolean(row.cuir && (row.qr_code_content || row.signed_pdf_url));

  return {
    id: row.id,
    medicationName: clinical.medication_name ?? primaryMed?.name ?? 'Prescripcion medica',
    dosage: clinical.dosage ?? primaryMed?.dosage ?? '',
    frequency: clinical.frequency ?? primaryMed?.frequency ?? '',
    instructions: clinical.instructions ?? primaryMed?.instructions ?? '',
    status: row.status,
    cuir: row.cuir,
    signedPdfUrl: row.signed_pdf_url,
    prescribedDate: row.created_at,
    expiresAt: null,
    doctorName,
    isDigitalReady,
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) return unauthorized();

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);

    const { data: rows, error: rxError } = await admin
      .from('prescriptions')
      .select('id, status, cuir, signed_pdf_url, qr_code_content, clinical_data, doctor_id, created_at, updated_at')
      .eq('patient_id', context.patientId)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    if (rxError) {
      logger.error('[patients/prescriptions] query failed', rxError);
      return internalError();
    }

    if (!rows || rows.length === 0) {
      return jsonOk([]);
    }

    const doctorIds = [...new Set(rows.map((r) => r.doctor_id))];

    const { data: doctors } = await admin
      .from('doctors')
      .select('id, user_id')
      .in('id', doctorIds);

    const doctorUserIds = (doctors ?? [])
      .map((d) => d.user_id)
      .filter((uid): uid is string => typeof uid === 'string');

    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', doctorUserIds.length > 0 ? doctorUserIds : ['__none__']);

    const doctorNameMap = new Map<string, string>();
    for (const doc of doctors ?? []) {
      const profile = (profiles ?? []).find((p) => p.user_id === doc.user_id);
      const name = profile
        ? `Dr. ${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
        : 'Medico';
      doctorNameMap.set(doc.id, name);
    }

    const result: PatientPrescriptionDTO[] = (rows as PrescriptionRow[]).map((row) =>
      mapRowToPatientDTO(row, doctorNameMap.get(row.doctor_id) ?? 'Medico'),
    );

    return jsonOk(result);
  } catch (err) {
    logger.error('[patients/prescriptions] GET error', err);
    return internalError();
  }
};
