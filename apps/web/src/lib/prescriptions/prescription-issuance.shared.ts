import type { SupabaseClient } from '@supabase/supabase-js';
import { getSubstanceCategory } from './strict-validation';

export interface ClinicalItem {
  generic_name?: string;
  commercial_name?: string;
  dosage?: string;
  presentation?: string;
  quantity?: number;
  instructions?: string;
  farmalink?: Record<string, unknown>;
}

export interface ClinicalData {
  items?: ClinicalItem[];
  diagnosis?: string;
  notes?: string;
  farmalink?: Record<string, unknown>;
  external_patient?: {
    name?: string;
    dni?: string;
    cuil?: string;
    address?: string;
    birth_date?: string;
    gender?: string;
  };
  care_guide_tips?: string | null;
  care_guide_forgotten?: string | null;
  care_guide_warnings?: string | null;
  care_guide_lifestyle?: string | null;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function buildControlledSemaphoreReasons(
  medicationName: string,
  category: ReturnType<typeof getSubstanceCategory>,
  validityDays: number,
): string[] | null {
  if (category === 'standard') return null;

  return [
    `Medicacion controlada: ${category}`,
    `Validez operativa: ${validityDays} dias`,
    `Requiere validacion farmaceutica de sustancia controlada`,
    `No repetir sin nueva receta: ${medicationName}`,
  ];
}

export function mapDrugCategoryForDatabase(
  category: ReturnType<typeof getSubstanceCategory>,
): 'default' | 'psychotropic' | 'narcotic' {
  if (category === 'estupefaciente') return 'narcotic';
  if (category === 'psicotropico' || category === 'stimulant') return 'psychotropic';
  return 'default';
}

export function resolveInsurancePlan(insuranceInfo: unknown): string | undefined {
  if (!insuranceInfo || typeof insuranceInfo !== 'object' || Array.isArray(insuranceInfo)) {
    return undefined;
  }

  const data = insuranceInfo as Record<string, unknown>;
  const pickString = (keys: string[]): string | undefined => {
    const value = keys.map((key) => data[key]).find((entry) => typeof entry === 'string');
    return typeof value === 'string' ? value : undefined;
  };
  const provider = pickString(['provider', 'insurance_provider', 'obraSocial']);
  const plan = pickString(['plan', 'insurance_plan', 'planName']);

  return [provider, plan].filter(Boolean).join(' ').trim() || undefined;
}

export interface IssuanceResult {
  cuir: string;
  qrContent: string;
  signedPdfUrl: string | null;
  issuedAt: string;
  expiresAt: string;
  vendorName: string;
  vendorId: string;
}

export type IssuanceError =
  | { code: 'doctor_not_found' }
  | { code: 'missing_license_number' }
  | { code: 'missing_refeps_id' }
  | { code: 'prescriber_validation_required' }
  | { code: 'missing_professional_address' }
  | { code: 'prescription_not_found' }
  | { code: 'not_your_prescription' }
  | { code: 'already_issued' }
  | { code: 'patient_not_found' }
  | { code: 'missing_patient_identification' }
  | { code: 'missing_patient_address' }
  | { code: 'no_medication' }
  | { code: 'missing_cuir' }
  | { code: 'pdf_generation_failed'; details?: string }
  | { code: 'pdf_upload_failed'; details?: string }
  | { code: 'update_failed'; details?: string }
  | { code: 'farmalink_missing_config' }
  | { code: 'farmalink_mapping_failed' }
  | { code: 'farmalink_registration_failed' }
  | { code: 'farmalink_rejected'; responseCode?: string }
  | { code: 'farmalink_pending_reconciliation' }
  | { code: 'farmalink_idempotency_unavailable' };

export type Result = { ok: true; data: IssuanceResult } | { ok: false; error: IssuanceError };

export async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stableBytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function fail(error: IssuanceError): Result { return { ok: false, error }; }

export async function resolveProfileName(
  supabase: SupabaseClient,
  userId: string,
  prefix: string,
): Promise<string> {
  const { data } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', userId)
    .single();
  if (!data) return prefix === 'Dr.' ? 'Médico' : 'Paciente';
  return `${prefix} ${data.first_name ?? ''} ${data.last_name ?? ''}`.trim() || prefix;
}

