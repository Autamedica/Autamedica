import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  medications?: Array<{ name?: string; dosage?: string; frequency?: string; instructions?: string }>;
  items?: Array<{ generic_name?: string; commercialName?: string; dosage?: string; instructions?: string }>;
}
interface PrescriptionRow {
  id: string; status: string; cuir: string | null; signed_pdf_url: string | null;
  qr_code_content: string | null; clinical_data: unknown; doctor_id: string;
  vendor_id?: string | null; vendor_name?: string | null; signature_method?: string | null; created_at: string;
}
interface MemedRow {
  id: string; doctor_id: string; patient_id: string; memed_id: string; status: string;
  provider_data: unknown; digital_link_data: unknown; created_at: string;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function memedLink(value: unknown): string | null {
  const object = asObject(value);
  const candidates = [object.url, object.link, object.pdf_url, object.document_url, object.prescription_url];
  const direct = candidates.find((candidate) => typeof candidate === 'string' && /^https:\/\//i.test(candidate));
  return typeof direct === 'string' ? direct : null;
}
function mapCore(row: PrescriptionRow, doctorName: string): PatientPrescriptionDTO & { provider: string } {
  const clinical = asObject(row.clinical_data) as ClinicalDataShape;
  const primaryMed = clinical.medications?.[0];
  const primaryItem = clinical.items?.[0];
  return {
    id: row.id,
    medicationName: clinical.medication_name ?? primaryMed?.name ?? primaryItem?.commercialName ?? primaryItem?.generic_name ?? 'Prescripcion medica',
    dosage: clinical.dosage ?? primaryMed?.dosage ?? primaryItem?.dosage ?? '',
    frequency: clinical.frequency ?? primaryMed?.frequency ?? '',
    instructions: clinical.instructions ?? primaryMed?.instructions ?? primaryItem?.instructions ?? '',
    status: row.status,
    cuir: row.cuir,
    signedPdfUrl: row.status === 'active' && row.signature_method === 'ac_external' ? `/api/doctors/prescriptions/${encodeURIComponent(row.id)}/pdf` : null,
    prescribedDate: row.created_at,
    expiresAt: null,
    doctorName,
    isDigitalReady: Boolean(row.cuir && (row.qr_code_content || row.signed_pdf_url)),
    provider: row.vendor_name?.toLowerCase() === 'memed' ? 'Memed BR' : 'RCTA / Core AR',
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals);
  if (!context) return unauthorized();

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as SupabaseClient;
    const authenticated = locals.supabase as unknown as {
      rpc?: (name: string) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
    } | undefined;

    const [coreResult, memedResult] = await Promise.all([
      admin.from('prescriptions')
        .select('id,status,cuir,signed_pdf_url,qr_code_content,clinical_data,doctor_id,vendor_id,vendor_name,signature_method,created_at')
        .eq('patient_id', context.patientId)
        .neq('status', 'draft')
        .order('created_at', { ascending: false }),
      authenticated?.rpc
        ? authenticated.rpc('patient_memed_prescriptions_get')
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (coreResult.error) {
      logger.error('[patients/prescriptions] core query failed', { code: coreResult.error.code });
      return internalError();
    }

    let memedRows = (memedResult.data ?? []) as MemedRow[];
    if (memedResult.error || !authenticated?.rpc) {
      if (memedResult.error) logger.warn('[patients/prescriptions] scoped Memed RPC unavailable; using patient-scoped service query');
      const fallback = await admin.from('memed_prescriptions')
        .select('id,doctor_id,patient_id,memed_id,status,provider_data,digital_link_data,created_at')
        .eq('patient_id', context.patientId).neq('status', 'deleted')
        .order('created_at', { ascending: false });
      if (fallback.error) logger.warn('[patients/prescriptions] Memed fallback query failed', { code: fallback.error.code });
      else memedRows = (fallback.data ?? []) as MemedRow[];
    }

    const coreRows = (coreResult.data ?? []) as PrescriptionRow[];
    const doctorIds = [...new Set([...coreRows.map((row) => row.doctor_id), ...memedRows.map((row) => row.doctor_id)])];
    const { data: doctors } = doctorIds.length
      ? await admin.from('doctors').select('id,user_id').in('id', doctorIds)
      : { data: [] };
    const doctorUserIds = (doctors ?? []).map((doctor) => doctor.user_id).filter((id): id is string => typeof id === 'string');
    const { data: profiles } = doctorUserIds.length
      ? await admin.from('profiles').select('user_id,first_name,last_name').in('user_id', doctorUserIds)
      : { data: [] };
    const doctorNameMap = new Map<string, string>();
    for (const doctor of doctors ?? []) {
      const profile = (profiles ?? []).find((candidate) => candidate.user_id === doctor.user_id);
      doctorNameMap.set(doctor.id, profile
        ? `Dr. ${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
        : 'Medico');
    }

    // The provider table is the canonical Memed BR record. Hide a mirrored
    // Core row when its vendor_id matches a canonical Memed prescription.
    const canonicalMemedIds = new Set(memedRows
      .filter((row) => row.status !== 'deleted')
      .map((row) => row.memed_id));
    const visibleCoreRows = coreRows.filter((row) => !(
      row.vendor_name?.toLowerCase() === 'memed'
      && row.vendor_id
      && canonicalMemedIds.has(row.vendor_id)
    ));
    const coreDtos = visibleCoreRows.map((row) => mapCore(row, doctorNameMap.get(row.doctor_id) ?? 'Medico'));
    const coreMemedIds = new Set(visibleCoreRows
      .filter((row) => row.vendor_name?.toLowerCase() === 'memed')
      .map((row) => row.vendor_id).filter((id): id is string => Boolean(id)));
    const coreIds = new Set(visibleCoreRows.map((row) => row.id));
    const memedDtos = memedRows
      .filter((row) => row.status !== 'deleted' && !coreMemedIds.has(row.memed_id) && !coreIds.has(row.id))
      .map((row) => {
        const provider = asObject(row.provider_data);
        const url = memedLink(row.digital_link_data);
        return {
          id: 'memed-' + row.id,
          medicationName: asText(provider.medication_name) ?? asText(provider.medicationName) ?? asText(provider.nome) ?? asText(provider.name) ?? 'Receita digital Memed',
          dosage: asText(provider.dosage) ?? asText(provider.dose) ?? '',
          frequency: asText(provider.frequency) ?? '',
          instructions: asText(provider.instructions) ?? '',
          status: row.status,
          cuir: asText(provider.cuir) ?? row.memed_id,
          signedPdfUrl: url,
          prescribedDate: row.created_at,
          expiresAt: null,
          doctorName: doctorNameMap.get(row.doctor_id) ?? 'Medico',
          isDigitalReady: Boolean(url),
          provider: 'Memed BR',
        };
      });

    const result = [...coreDtos, ...memedDtos]
      .sort((a, b) => new Date(b.prescribedDate).getTime() - new Date(a.prescribedDate).getTime());
    return jsonOk(result);
  } catch (err) {
    logger.error('[patients/prescriptions] GET error', err);
    return internalError();
  }
};
