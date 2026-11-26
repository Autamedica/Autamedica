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
  vendor_id?: string | null; vendor_name?: string | null; signature_method?: string | null;
  country_code?: string | null; created_at: string;
}
interface MemedRow {
  id: string; doctor_id: string; patient_id: string; memed_id: string; status: string;
  pdf_signature_verified?: boolean | null;
  provider_data: unknown; digital_link_data: unknown; created_at: string;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function memedLink(value: unknown, depth = 0): string | null {
  if (depth > 6 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = memedLink(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const object = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(object)) {
    if (/(url|link|pdf|document)/i.test(key) && typeof nested === 'string') {
      try {
        const url = new URL(nested);
        if (url.protocol === 'https:' && /(^|[.])memed[.]com(?:[.]br)?$/i.test(url.hostname)) return url.toString();
      } catch { /* Ignore malformed provider URLs. */ }
    }
  }
  for (const nested of Object.values(object)) {
    const found = memedLink(nested, depth + 1);
    if (found) return found;
  }
  return null;
}
function memedAccessCode(value: unknown, depth = 0): string | null {
  const accepted = new Set(['unlockcode', 'accesscode', 'password', 'senha', 'codigodesbloqueio', 'codigoacesso', 'pin']);
  if (depth > 6 || !value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = memedAccessCode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const object = value as Record<string, unknown>;
  for (const [key, nested] of Object.entries(object)) {
    if (accepted.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''))
      && typeof nested === 'string' && nested.trim().length >= 4 && nested.trim().length <= 32) return nested.trim();
  }
  for (const nested of Object.values(object)) {
    const found = memedAccessCode(nested, depth + 1);
    if (found) return found;
  }
  return null;
}
export function supportsPatientPdfDownload(row: Pick<PrescriptionRow, 'status' | 'signature_method' | 'country_code'>): boolean {
  return row.status === 'active' && (row.signature_method === 'ac_external' || (row.country_code === 'AR' && row.signature_method === 'electronic_simple'));
}

export function mapCore(row: PrescriptionRow, doctorName: string): PatientPrescriptionDTO & { provider: string } {
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
    signedPdfUrl: supportsPatientPdfDownload(row) ? `/api/doctors/prescriptions/${encodeURIComponent(row.id)}/pdf` : null,
    prescribedDate: row.created_at,
    expiresAt: null,
    doctorName,
    isDigitalReady: Boolean(row.cuir && (row.qr_code_content || row.signed_pdf_url)),
    provider: row.vendor_name?.toLowerCase() === 'memed' ? 'Memed BR' : 'RCTA / Core AR',
  };
}

function safeTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
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
        .select('id,status,cuir,signed_pdf_url,qr_code_content,clinical_data,doctor_id,vendor_id,vendor_name,signature_method,country_code,created_at')
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
        .select('id,doctor_id,patient_id,memed_id,status,pdf_signature_verified,provider_data,digital_link_data,created_at')
        .eq('patient_id', context.patientId).neq('status', 'deleted')
        .order('created_at', { ascending: false });
      if (fallback.error) logger.warn('[patients/prescriptions] Memed fallback query failed', { code: fallback.error.code });
      else memedRows = (fallback.data ?? []) as MemedRow[];
    }

    const coreRows = (coreResult.data ?? []) as PrescriptionRow[];
    const doctorIds = [...new Set([...coreRows.map((row) => row.doctor_id), ...memedRows.map((row) => row.doctor_id)].filter(Boolean))];
    const { data: doctors, error: doctorsError } = doctorIds.length
      ? await admin.from('doctors').select('id,user_id').in('id', doctorIds)
      : { data: [], error: null };
    if (doctorsError) logger.warn('[patients/prescriptions] doctors lookup failed', { code: doctorsError.code });

    const doctorUserIds = (doctors ?? []).map((doctor) => doctor.user_id).filter((id): id is string => typeof id === 'string');
    const { data: profiles, error: profilesError } = doctorUserIds.length
      ? await admin.from('profiles').select('user_id,first_name,last_name').in('user_id', doctorUserIds)
      : { data: [], error: null };
    if (profilesError) logger.warn('[patients/prescriptions] profiles lookup failed', { code: profilesError.code });
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
      .filter((row) => {
        if (row.status === 'deleted' || coreMemedIds.has(row.memed_id) || coreIds.has(row.id)) return false;
        const provider = asObject(row.provider_data);
        const medications = Array.isArray(provider.medications) ? provider.medications : [];
        const isPureAtestado = (provider.document_type === 'atestado' || provider.has_atestado === true)
          && medications.length === 0
          && !asText(provider.medication_name)
          && !asText(provider.medicationName);
        return !isPureAtestado;
      })
      .map((row) => {
        const provider = asObject(row.provider_data);
        const digitalData = asObject(row.digital_link_data);
        const providerPdfUrl = memedLink(digitalData.pdf) ?? memedLink(digitalData.digital) ?? memedLink(row.digital_link_data);
        const deliveryEligible = row.pdf_signature_verified === true
          || (provider.provider_reported_signed === true && provider.patient_delivery_eligible === true);
        const patientPdfUrl = providerPdfUrl && deliveryEligible
          ? `/api/patients/prescriptions/${encodeURIComponent(`memed-${row.id}`)}/pdf`
          : null;
        return {
          id: 'memed-' + row.id,
          medicationName: asText(provider.medication_name) ?? asText(provider.medicationName) ?? asText(provider.nome) ?? asText(provider.name) ?? 'Receita digital Memed',
          dosage: asText(provider.dosage) ?? asText(provider.dose) ?? '',
          frequency: asText(provider.frequency) ?? '',
          instructions: asText(provider.instructions) ?? '',
          status: row.status,
          cuir: asText(provider.cuir),
          signedPdfUrl: patientPdfUrl,
          accessCode: memedAccessCode(row.digital_link_data),
          prescribedDate: row.created_at,
          expiresAt: null,
          doctorName: doctorNameMap.get(row.doctor_id) ?? 'Medico',
          isDigitalReady: Boolean(patientPdfUrl),
          provider: 'Memed BR',
        };
      });

    const result = [...coreDtos, ...memedDtos]
      .sort((a, b) => safeTimestamp(b.prescribedDate) - safeTimestamp(a.prescribedDate));
    return jsonOk(result);
  } catch (err) {
    logger.error('[patients/prescriptions] GET error', err);
    return internalError();
  }
};
