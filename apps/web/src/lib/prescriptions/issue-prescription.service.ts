/**
 * Service: Prescription issuance orchestrator.
 * Extracts all business logic from the issue route into a testable service.
 *
 * Flow: validate → generate artifacts → store PDF → update prescription
 *       → audit events → create dispensation order
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerEnvOrDefault, logger } from '@autamedica/shared';
import { getRuntimeEnvValue } from '@/lib/runtime-env';
import {
  checkDirectPrescriptionIssuance,
  hasEligibleProfessionalPadesCertificate,
} from './prescription-issuance-gate';
import { FarmalinkClient } from './farmalink.client';
import { claimFarmalinkIssue, recordFarmalinkIssue } from './farmalink.issue-gate';
import {
  FarmalinkMappingError,
  buildFarmalinkAltaRecetaRequest,
} from './farmalink.mapper';
import type {
  FarmalinkAltaRecetaRequest,
  FarmalinkAltaResult,
  FarmalinkPrescriptionMapInput,
} from './farmalink.types';
import { generatePrescriptionPdf, type PrescriptionArtifacts } from './pdf-prescription.service';
import { generateBrazilPrescriptionPdf } from './brazil/brazil-pdf-prescription.service';
import { rctaService } from './rcta.service';
// Certificate queries are Supabase-only (no node-forge dependency)
import { getActiveCertificate, loadSigningCredentials } from '../doctors/services/certificate-query.service';
import {
  getSubstanceCategory,
  getValidityPeriodDays,
  requiresStrictPrescriptionValidation,
} from './strict-validation';

interface ClinicalItem {
  generic_name?: string;
  commercial_name?: string;
  dosage?: string;
  presentation?: string;
  quantity?: number;
  instructions?: string;
  farmalink?: Record<string, unknown>;
}

interface ClinicalData {
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

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function buildControlledSemaphoreReasons(
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

function mapDrugCategoryForDatabase(
  category: ReturnType<typeof getSubstanceCategory>,
): 'default' | 'psychotropic' | 'narcotic' {
  if (category === 'estupefaciente') return 'narcotic';
  if (category === 'psicotropico' || category === 'stimulant') return 'psychotropic';
  return 'default';
}

function resolveInsurancePlan(insuranceInfo: unknown): string | undefined {
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
  | { code: 'prescription_country_required' }
  | { code: 'doctor_country_mismatch' }
  | { code: 'patient_country_required_or_mismatched' }
  | { code: 'br_requires_memed_provider' }
  | { code: 'ar_production_homologation_required' }
  | { code: 'digital_signature_required' }
  | { code: 'digital_signature_failed' }
  | { code: 'reissue_requires_verified_signature' }
  | { code: 'farmalink_registration_required' }
  | { code: 'pdf_generation_failed'; details?: string }
  | { code: 'pdf_upload_failed'; details?: string }
  | { code: 'update_failed'; details?: string }
  | { code: 'farmalink_missing_config' }
  | { code: 'farmalink_mapping_failed' }
  | { code: 'farmalink_registration_failed' }
  | { code: 'farmalink_rejected'; responseCode?: string }
  | { code: 'farmalink_pending_reconciliation' }
  | { code: 'farmalink_idempotency_unavailable' };

type Result = { ok: true; data: IssuanceResult } | { ok: false; error: IssuanceError };

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stableBytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function fail(error: IssuanceError): Result { return { ok: false, error }; }

type UnknownRecord = Record<string, unknown>;

interface IssueDoctor {
  id: string;
  license_type?: string | null;
  license_number: string;
  specialty?: string | null;
  refeps_id?: string | null;
  enrollment_entity?: string | null;
  enrollment_jurisdiction?: string | null;
  professional_address?: string | null;
}

interface IssuePatient {
  dni?: string | null;
  cuil?: string | null;
  address?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  insurance_info?: unknown;
}

type PrescriberValidationStatus = 'pending' | 'valid' | 'pending_review' | 'rejected' | 'exempt';

function canIssueWithPrescriberValidationStatus(status?: string | null): boolean {
  return status === 'valid' || status === 'exempt';
}

interface FarmalinkRegistration {
  vendorName: 'farmalink';
  genericMode: 'S' | 'N';
  vendorId: string;
  // PAN, CUIL and plan must be taken from the exact accepted Farmalink request.
  affiliateCredential: { codEntidad: number; pan: string; plan: string };
  affiliateCuil: string;
  result: FarmalinkAltaResult;
  externalPrescription: Parameters<typeof generatePrescriptionPdf>[0]['externalPrescription'];
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function readRecord(source: UnknownRecord | undefined, keys: string[]): UnknownRecord | undefined {
  for (const key of keys) {
    const record = asRecord(source?.[key]);
    if (record) return record;
  }
  return undefined;
}

function readString(source: UnknownRecord | undefined, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readBoolean(source: UnknownRecord | undefined, keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['true', '1', 'yes', 'si', 'sí'].includes(normalized)) return true;
      if (['false', '0', 'no'].includes(normalized)) return false;
    }
  }
  return undefined;
}

function readNumber(source: UnknownRecord | undefined, keys: string[]): number | undefined {
  const value = readString(source, keys);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readEnv(keys: string[], defaultValue?: string): string | undefined {
  for (const key of keys) {
    const value = getRuntimeEnvValue(key) ?? getServerEnvOrDefault(key);
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return defaultValue;
}

function readEnvNumber(keys: string[]): number | undefined {
  const value = readEnv(keys);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function firstText(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.trim().length > 0)?.trim();
}

function buildFarmalinkPrescriptionMapInput(input: {
  clinicalData: ClinicalData;
  doctor: IssueDoctor;
  doctorName: string;
  item: ClinicalItem;
  patient: IssuePatient;
  patientName: string;
  now: string;
  expiresAt: string;
}): FarmalinkPrescriptionMapInput {
  // Proxy patient records and multi-item PDF support are not yet verified for Farmalink.
  // Refuse rather than submit a different identity or silently drop medications.
  if (input.clinicalData.external_patient) throw new FarmalinkMappingError('external_patient');
  if ((input.clinicalData.items?.length ?? 0) > 1) throw new FarmalinkMappingError('items');
  const farmalink = asRecord(input.clinicalData.farmalink);
  const organization = readRecord(farmalink, ['organization', 'organizacion']);
  const credential = readRecord(farmalink, ['credential', 'credencial', 'affiliate', 'afiliado']);
  const prescriber = readRecord(farmalink, ['prescriber', 'medico']);
  const itemConfig = asRecord(input.item.farmalink)
    ?? readRecord(farmalink, ['item', 'defaultItem', 'default_item'])
    ?? asRecord(Array.isArray(farmalink?.items) ? farmalink?.items[0] : undefined);

  const insurance = asRecord(input.patient.insurance_info);
  const insuranceFarmalink = readRecord(insurance, ['farmalink', 'farmalink_credential']);
  const credentialSource = credential ?? insuranceFarmalink ?? insurance;
  const genericMode = readBoolean(itemConfig, ['generic', 'generico']) ?? true;
  // If a clinician selected brand mode, do not send an alta that cannot render
  // the required commercial product name on the resulting PDF.
  if (!genericMode && !input.item.commercial_name?.trim()) {
    throw new FarmalinkMappingError('items.0.commercialName');
  }

  return {
    organization: {
      // The vendor-assigned organization must come from server-side runtime config,
      // not mutable prescription metadata (which may still contain the old demo ID 100).
      id: readEnv(['FARMALINK_ORG_ID']) ?? '',
      type: firstText(
        readString(organization, ['type', 'tipoOrganizacion', 'tipo_organizacion']),
        readEnv(['FARMALINK_ORG_TYPE'], 'NMD'),
      ) ?? 'NMD',
      ipOrigin: firstText(
        readString(organization, ['ipOrigin', 'ip_origen', 'ipOrigen']),
        readEnv(['FARMALINK_IP_ORIGIN']),
      ) ?? '',
      browserInfo: firstText(
        readString(organization, ['browserInfo', 'infoBrowser', 'info_browser']),
        readEnv(['FARMALINK_BROWSER_INFO'], 'AutaMedica'),
      ),
    },
    validity: {
      from: input.now,
      to: input.expiresAt,
    },
    prescriptionType: firstText(
      readString(farmalink, ['prescriptionType', 'tipoReceta', 'tipo_receta']),
      readEnv(['FARMALINK_PRESCRIPTION_TYPE']),
    ),
    treatmentType: readString(farmalink, ['treatmentType', 'tipoTratamiento', 'tipo_tratamiento']) as
      FarmalinkPrescriptionMapInput['treatmentType'],
    diagnosisText: input.clinicalData.diagnosis,
    affiliate: {
      fullName: input.patientName,
      sex: input.patient.gender ?? undefined,
      birthDate: input.patient.birth_date ?? '',
      cuil: input.patient.cuil ?? undefined,
      documentNumber: input.patient.dni ?? undefined,
      credential: {
        codEntidad: readNumber(credentialSource, ['codEntidad', 'cod_entidad', 'entityCode', 'entity_code'])
          ?? readEnvNumber(['FARMALINK_HOMOLOGATION_COD_ENTIDAD', 'FARMALINK_COD_ENTIDAD'])
          ?? Number.NaN,
        pan: firstText(
          readString(credentialSource, ['pan', 'credencial', 'credential', 'credentialNumber', 'credential_number']),
          readEnv(['FARMALINK_HOMOLOGATION_CREDENCIAL', 'FARMALINK_CREDENCIAL']),
        ) ?? '',
        plan: firstText(
          readString(credentialSource, ['plan', 'planName', 'plan_name']),
          readEnv(['FARMALINK_HOMOLOGATION_PLAN', 'FARMALINK_PLAN'], 'NO POSEE'),
        ) ?? 'NO POSEE',
      },
    },
    prescriber: {
      fullName: input.doctorName,
      sex: firstText(
        readString(prescriber, ['sex', 'sexo']),
        readEnv(['FARMALINK_PRESCRIBER_SEX']),
      ),
      birthDate: firstText(
        readString(prescriber, ['birthDate', 'birth_date', 'fechaNacimiento', 'fecha_nacimiento']),
        readEnv(['FARMALINK_PRESCRIBER_BIRTH_DATE']),
      ) ?? '',
      documentNumber: firstText(
        readString(prescriber, ['documentNumber', 'document_number', 'numeroDocumento', 'numero_documento', 'dni']),
        readEnv(['FARMALINK_PRESCRIBER_DOCUMENT_NUMBER']),
      ) ?? '',
      cuil: firstText(
        readString(prescriber, ['cuil']),
        readEnv(['FARMALINK_PRESCRIBER_CUIL']),
      ),
      address: input.doctor.professional_address ?? '',
      refeps: input.doctor.refeps_id ?? undefined,
      license: {
        tipo: firstText(input.doctor.license_type, input.doctor.enrollment_entity) ?? '',
        provincia: input.doctor.enrollment_jurisdiction ?? '',
        numero: input.doctor.license_number,
        especialidad: input.doctor.specialty ?? undefined,
      },
    },
    items: [
      {
        quantity: input.item.quantity ?? 1,
        productCode: firstText(
          readString(itemConfig, ['productCode', 'product_code', 'codProducto', 'cod_producto']),
          readEnv(['FARMALINK_DEFAULT_PRODUCT_CODE']),
        ) ?? '',
        drugCode: firstText(
          readString(itemConfig, ['drugCode', 'drug_code', 'codDroga', 'cod_droga']),
          readEnv(['FARMALINK_DEFAULT_DRUG_CODE']),
        ) ?? '',
        genericText: firstText(
          readString(itemConfig, ['genericText', 'generic_text', 'textoGenerico', 'texto_generico']),
          [input.item.generic_name, input.item.dosage, input.item.presentation].filter(Boolean).join(' '),
        ) ?? input.item.generic_name ?? '',
        generic: genericMode,
        brandRecommended: readBoolean(itemConfig, ['brandRecommended', 'brand_recommended', 'recomendacionMedica'])
          ?? Boolean(input.item.commercial_name),
      },
    ],
  };
}

async function registerFarmalinkIfEnabled(input: {
  supabase: SupabaseClient;
  prescriptionId: string;
  actorUserId: string;
  clinicalData: ClinicalData;
  doctor: IssueDoctor;
  doctorName: string;
  item: ClinicalItem;
  patient: IssuePatient;
  patientName: string;
  now: string;
  expiresAt: string;
}): Promise<{ ok: true; registration: FarmalinkRegistration | null } | { ok: false; error: IssuanceError }> {
  let client: FarmalinkClient | null;
  try {
    client = FarmalinkClient.fromEnv();
  } catch (error) {
    logger.error('[issuePrescription] Farmalink config missing', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: { code: 'farmalink_missing_config' } };
  }

  if (!client) return { ok: true, registration: null };

  let request: FarmalinkAltaRecetaRequest;
  try {
    request = buildFarmalinkAltaRecetaRequest(buildFarmalinkPrescriptionMapInput(input));
    // Before creating a durable claim or contacting Farmalink, guarantee that
    // the PDF can show the patient's CUIL in a second scannable barcode.
    const submittedCuil = String(request.altaRecetaElectRq.recElectronica.afiliado.cuil ?? '');
    if (!/^\d{11}$/.test(submittedCuil)) {
      throw new FarmalinkMappingError('affiliate.cuil');
    }
  } catch (error) {
    logger.error('[issuePrescription] Farmalink mapping failed', {
      field: error instanceof FarmalinkMappingError ? error.field : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: { code: 'farmalink_mapping_failed' } };
  }

  // Unique, durable claim is COMMITTED before reaching Farmalink.
  // If this RPC fails, do not send a request: avoid duplicate issues after
  // process crashes, multiple tabs, or HTTP 504/timeout ambiguity.
  const requestHash = await sha256BytesHex(new TextEncoder().encode(JSON.stringify(request)));
  const claim = await claimFarmalinkIssue(input.supabase, input.prescriptionId, requestHash, input.actorUserId, input.clinicalData);
  if (claim.ok === false) {
    logger.error('[issuePrescription] Farmalink once-only claim unavailable', {
      prescriptionId: input.prescriptionId,
      reason: claim.reason,
    });
    return { ok: false, error: { code: 'farmalink_idempotency_unavailable' } };
  }
  if (!claim.value.claimed) {
    logger.warn('[issuePrescription] Farmalink duplicate alta prevented', {
      prescriptionId: input.prescriptionId,
      state: claim.value.state,
    });
    return { ok: false, error: { code: 'farmalink_pending_reconciliation' } };
  }

  const attemptId = claim.value.attempt_id;
  try {
    const result = await client.altaReceta(request);
    if (!result.approved || !result.nroRecElectronica) {
      const persisted = await recordFarmalinkIssue(
        input.supabase, input.prescriptionId, attemptId, input.actorUserId, 'rejected',
        undefined, result.responseCode,
      );
      if (!persisted) return { ok: false, error: { code: 'farmalink_idempotency_unavailable' } };
      logger.warn('[issuePrescription] Farmalink rejected AltaReceta', {
        responseCode: result.responseCode,
        reference: result.reference,
      });
      return {
        ok: false,
        error: { code: 'farmalink_rejected', responseCode: result.responseCode },
      };
    }

    // Record the external receipt before any PDF signing/storage can fail.
    // A subsequent invocation must NOT call altaReceta again.
    const persisted = await recordFarmalinkIssue(
      input.supabase, input.prescriptionId, attemptId, input.actorUserId,
      'confirmed', result.nroRecElectronica, result.responseCode,
    );
    if (!persisted) return { ok: false, error: { code: 'farmalink_pending_reconciliation' } };

    return {
      ok: true,
      registration: {
        vendorName: 'farmalink',
        genericMode: request.altaRecetaElectRq.recElectronica.detalleRecElectronica.item[0]?.generico ?? 'S',
        vendorId: result.nroRecElectronica,
        affiliateCredential: request.altaRecetaElectRq.recElectronica.afiliado.credencial,
        affiliateCuil: String(request.altaRecetaElectRq.recElectronica.afiliado.cuil),
        result,
        externalPrescription: {
          provider: 'farmalink',
          number: result.nroRecElectronica,
          displayLabel: 'RECETA FARMALINK',
          legend: 'Número de receta para validación online en farmacia',
        },
      },
    };
  } catch (error) {
    // Even an HTTP rejection may be ambiguous at the vendor boundary.
    // This state never releases the claim for automatic retransmission.
    await recordFarmalinkIssue(input.supabase, input.prescriptionId, attemptId, input.actorUserId, 'unknown');
    logger.error('[issuePrescription] Farmalink AltaReceta outcome unknown; retry blocked', {
      prescriptionId: input.prescriptionId,
      name: error instanceof Error ? error.name : undefined,
    });
    return { ok: false, error: { code: 'farmalink_pending_reconciliation' } };
  }
}

async function resolveProfileName(
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

export async function issuePrescription(
  supabase: SupabaseClient,
  prescriptionId: string,
  userId: string,
  runtimeEnv?: Record<string, unknown>,
): Promise<Result> {
  // 1. Resolve and validate doctor
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, care_country, license_number, license_type, uf_brazil, rqe_number, cpf, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address, signature_image_url, stamp_image_url, care_guide_template')
    .eq('user_id', userId)
    .maybeSingle();

  if (!doctor) return fail({ code: 'doctor_not_found' });
  if (!doctor.license_number) return fail({ code: 'missing_license_number' });
  if (!doctor.professional_address) return fail({ code: 'missing_professional_address' });

  // 2. Get and validate prescription
  const { data: rx } = await supabase
    .from('prescriptions')
    .select('id, doctor_id, patient_id, status, clinical_data, cuir, country_code, prescription_model_br')
    .eq('id', prescriptionId)
    .single();

  if (!rx) return fail({ code: 'prescription_not_found' });
  if (rx.doctor_id !== doctor.id) return fail({ code: 'not_your_prescription' });
  if (rx.cuir) return fail({ code: 'already_issued' });

  // Explicit country must be set by the actual clinical encounter. Never
  // silently infer Argentina from an unknown doctor/patient/prescription.
  const prescriptionCountry: string | null = rx.country_code ?? null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('sss_validation_status')
    .eq('user_id', userId)
    .single();

  // REFEPS is an Argentine registry. Brazilian care/CRM credentials are
  // validated under CFM and must not be rejected for lacking an Argentine ID.
  const isBrazilianCfmPrescriber = doctor.care_country === 'BR'
    || (doctor.license_type === 'CRM' && Boolean(doctor.uf_brazil));
  if (prescriptionCountry === 'AR' && !isBrazilianCfmPrescriber) {
    if (!doctor.refeps_id) return fail({ code: 'missing_refeps_id' });
    if (!canIssueWithPrescriberValidationStatus(
      profile?.sss_validation_status as PrescriberValidationStatus | null | undefined,
    )) {
      return fail({ code: 'prescriber_validation_required' });
    }
  }

  // 3. Get and validate patient
  const { data: patient } = await supabase
    .from('patients')
    .select('user_id, care_country, dni, cuil, cpf, cns, address, birth_date, gender, insurance_info')
    .eq('id', rx.patient_id)
    .single();

  if (!patient) return fail({ code: 'patient_not_found' });

  const doctorCountry = doctor.care_country === 'AR' || doctor.care_country === 'BR'
    ? doctor.care_country
    : doctor.license_type === 'CRM' && doctor.uf_brazil ? 'BR'
      : doctor.license_type === 'MN' || doctor.license_type === 'MP' ? 'AR'
        : null;

  const issuanceGate = checkDirectPrescriptionIssuance({
    prescriptionCountry,
    doctorCountry,
    patientCountry: patient.care_country,
    argentinaProductionApproved: runtimeEnv?.AR_RX_PRODUCTION_APPROVED === 'true',
  });
  if ('code' in issuanceGate) return fail({ code: issuanceGate.code });

  // 4. Parse clinical data
  const clinicalData = rx.clinical_data as ClinicalData;
  const externalPatient = clinicalData?.external_patient;
  
  const { data: dispatch } = await supabase
    .from('pharmacy_dispatch_requests')
    .select('id, kiosk_id, pharmacy_id, patient_dni, patient_cpf, patient_phone')
    .eq('patient_id', rx.patient_id)
    .eq('status', 'completed')
    .not('patient_phone', 'is', null)
    .limit(1)
    .maybeSingle();
  const dispatchIdentity = dispatch?.patient_cpf || dispatch?.patient_dni;
  const hasPatientId = patient.dni
    || patient.cuil
    || (patient as { cpf?: string }).cpf
    || (patient as { ci?: string }).ci
    || externalPatient?.dni
    || externalPatient?.cuil
    || (externalPatient as { cpf?: string })?.cpf
    || (externalPatient as { ci?: string })?.ci
    || dispatchIdentity;

  if (!hasPatientId) {
    return fail({ code: 'missing_patient_identification' });
  }

  let patientAddress = patient.address || externalPatient?.address || undefined;
  if (!patientAddress && dispatch && dispatchIdentity && dispatch.patient_phone) {
    const patientIdentity = (patient as { cpf?: string }).cpf || patient.dni
      || (externalPatient as { cpf?: string })?.cpf || externalPatient?.dni || dispatchIdentity;
    if (dispatchIdentity.replace(/\\D/g, '') === patientIdentity.replace(/\\D/g, '')) {
      const counterId = dispatch.pharmacy_id || dispatch.kiosk_id || dispatch.id;
      patientAddress = `Atención en mostrador de farmacia (identificador ${counterId})`;
    }
  }
  if (!patientAddress) return fail({ code: 'missing_patient_address' });

  // 5. Resolve names
  const patientName = externalPatient?.name?.trim()
    || (patient.user_id ? await resolveProfileName(supabase, patient.user_id, '') : 'Paciente');
  const doctorName = await resolveProfileName(supabase, userId, 'Dr.');

  const item = clinicalData?.items?.[0];
  if (!item?.generic_name) return fail({ code: 'no_medication' });

  const medicationName = item.generic_name;
  const substanceCategory = getSubstanceCategory(medicationName);
  const databaseDrugCategory = mapDrugCategoryForDatabase(substanceCategory);
  const isControlledSubstance = requiresStrictPrescriptionValidation(medicationName);
  const validityDays = getValidityPeriodDays(medicationName);
  const issuedAtDate = new Date();
  const now = issuedAtDate.toISOString();
  const expiresAt = addDays(issuedAtDate, validityDays).toISOString();
  const controlledSemaphoreReasons = buildControlledSemaphoreReasons(
    medicationName,
    substanceCategory,
    validityDays,
  );

  // Preflight professional signing BEFORE any Farmalink AltaReceta.
  // This does not constitute signature verification: the actual PDF must
  // still be signed successfully before it can be stored as 'sent'.
  const activeSigningCertificate = await getActiveCertificate(supabase, doctor.id);
  // Never mistake a locally self-signed certificate for a verified
  // professional signing certificate, even when its database status is active.
  if (!activeSigningCertificate ||
      !hasEligibleProfessionalPadesCertificate(activeSigningCertificate)) {
    return fail({ code: 'digital_signature_required' });
  }
  try {
    await loadSigningCredentials(supabase, doctor.id, activeSigningCertificate.certFingerprint);
    await import('./pdf-signer.service');
  } catch (error) {
    logger.warn('[issuePrescription] Digital signing preflight unavailable', {
      prescriptionId,
      errorName: error instanceof Error ? error.name : 'unknown',
    });
    return fail({ code: 'digital_signature_required' });
  }

  let externalRegistration: FarmalinkRegistration | undefined;
  if (prescriptionCountry === 'AR') {
    const farmalinkRegistration = await registerFarmalinkIfEnabled({
      supabase,
      prescriptionId,
      actorUserId: userId,
      clinicalData,
      doctor,
      doctorName,
      item,
      patient,
      patientName,
      now,
      expiresAt,
    });
    if (farmalinkRegistration.ok === false) return fail(farmalinkRegistration.error);
    externalRegistration = farmalinkRegistration.registration;
  }

  // A locally manufactured vendor identifier is NOT official registration.
  if (!externalRegistration) return fail({ code: 'farmalink_registration_required' });
  const vendorName = externalRegistration.vendorName;
  const vendorId = externalRegistration.vendorId;

  // 6. Generate artifacts (PDF + QR + CUIR)
  let artifacts: PrescriptionArtifacts;
  try {
    if (prescriptionCountry === 'BR') {
      const generated = await rctaService.registerPrescription(
        userId,
        rx.patient_id,
        medicationName,
        { groupId: prescriptionId },
      );
      const verificationUrl = `https://autamedica.com/verify/${generated.cuir}`;
      const brPdf = generateBrazilPrescriptionPdf({
        prescriptionId,
        model: ((rx as { prescription_model_br?: string })?.prescription_model_br as 'simples') || 'simples',
        patient: {
          name: patientName,
          cpf: (patient as { cpf?: string }).cpf || (externalPatient as { cpf?: string })?.cpf || patient.dni || externalPatient?.dni || '',
          cns: (patient as { cns?: string }).cns,
          birthDate: patient.birth_date || externalPatient?.birth_date,
          address: patientAddress,
        },
        prescriber: {
          name: doctorName,
          crm: doctor.license_number,
          uf: doctor.uf_brazil || 'RS',
          rqe: (doctor as { rqe_number?: string }).rqe_number || undefined,
          cpf: (doctor as { cpf?: string }).cpf || '',
          specialty: doctor.specialty || undefined,
          address: doctor.professional_address || undefined,
          signatureImageUrl: doctor.signature_image_url || undefined,
        },
        medications: [
          {
            genericName: medicationName,
            commercialName: item.commercial_name,
            dosage: item.dosage || '',
            presentation: item.presentation || '',
            quantity: item.quantity || 1,
            instructions: item.instructions || '',
          },
        ],
        diagnosis: clinicalData.diagnosis || '',
        notes: clinicalData.notes,
        issuedAt: now,
        expiresAt,
        itiValidationUrl: verificationUrl,
      });

      artifacts = {
        cuir: generated.cuir,
        pdfBuffer: brPdf,
        pdfFilename: `Receita_Digital_${doctor.license_number}_${generated.cuir.slice(-6)}.pdf`,
        qrDataUrl: '',
        qrContent: verificationUrl,
      };
    } else {
      artifacts = await generatePrescriptionPdf({
        prescriptionId,
        externalPrescription: externalRegistration?.externalPrescription,
        medication: {
          genericName: medicationName,
          // Farmalink S (generic-only) must not display a commercial brand.
          commercialName: externalRegistration?.genericMode === 'S' ? undefined : item.commercial_name,
          dosage: item.dosage ?? '',
          presentation: item.presentation ?? '',
          quantity: item.quantity ?? 0,
          instructions: item.instructions ?? '',
        },
        diagnosis: clinicalData.diagnosis ?? '',
        notes: clinicalData.notes,
        patient: {
          name: patientName,
          dni: patient.dni ?? externalPatient?.dni ?? (patient as { ci?: string }).ci ?? (externalPatient as { ci?: string })?.ci ?? undefined,
          // Never mix locally modified data with the CUIL accepted by Farmalink.
          cuil: externalRegistration?.affiliateCuil ?? patient.cuil ?? externalPatient?.cuil ?? undefined,
          dateOfBirth: patient.birth_date ?? externalPatient?.birth_date ?? undefined,
          sex: patient.gender ?? externalPatient?.gender ?? undefined,
          insurancePlan: externalRegistration?.affiliateCredential.plan ?? resolveInsurancePlan(patient.insurance_info),
          affiliateCredential: externalRegistration?.affiliateCredential.pan,
          insuranceEntityCode: externalRegistration?.affiliateCredential.codEntidad,
          address: patientAddress,
        },
        prescriber: {
          name: doctorName,
          license: doctor.license_number,
          licenseJurisdiction: doctor.enrollment_jurisdiction ?? (prescriptionCountry === 'UY' ? 'Uruguay' : undefined),
          licenseEntity: doctor.enrollment_entity ?? (prescriptionCountry === 'UY' ? 'MSP' : undefined),
          refeps: doctor.refeps_id ?? undefined,
          specialty: doctor.specialty ?? undefined,
          professionalAddress: doctor.professional_address ?? undefined,
          signatureImageUrl: doctor.signature_image_url ?? undefined,
          stampImageUrl: doctor.stamp_image_url ?? undefined,
        },
        issuedAt: now,
        expiresAt,
        careGuide: {
          tips: clinicalData.care_guide_tips,
          forgotten: clinicalData.care_guide_forgotten,
          warnings: clinicalData.care_guide_warnings,
          lifestyle: clinicalData.care_guide_lifestyle,
        },
        template: doctor.care_guide_template ?? 'neutral',
      });
    }
  } catch (error) {
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    logger.error('[issuePrescription] PDF generation failed', {
      prescriptionId,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    });
    return fail({ code: 'pdf_generation_failed', details });
  }

  // 6b. PAdES must actually succeed. A generated PDF or an image of a
  // physician's signature is not evidence of a valid digital signature.
  // Never emit an ACT_DIGITAL_SIGNATURE event for electronic_simple fallback.
  let finalPdfBuffer: Uint8Array;
  // Application classification only. Actual trust-chain/legal validation
  // remains a separate production approval condition.
  const signatureMethod = 'ac_external';
  const certFingerprint = activeSigningCertificate.certFingerprint;
  try {
    const { p12Buffer, password } = await loadSigningCredentials(
      supabase, doctor.id, certFingerprint,
    );
    const { signPdfWithP12 } = await import('./pdf-signer.service');
    const signResult = await signPdfWithP12({
      pdfBuffer: artifacts.pdfBuffer,
      p12Buffer,
      password,
      signerName: doctorName,
      reason: `Receta ${artifacts.cuir} - ${doctorName}`,
      location: doctor.enrollment_jurisdiction ?? 'Argentina',
    });
    finalPdfBuffer = signResult.signedPdfBuffer;
    if (!finalPdfBuffer?.byteLength) throw new Error('empty_signed_pdf');
    logger.info('[issuePrescription] PDF signed with PAdES', { cuir: artifacts.cuir });
  } catch (signError) {
    // Farmalink Alta may already exist. Do not silently retry and create a
    // second official registration. Never store the unsigned PDF as issued.
    logger.error('[issuePrescription] PAdES failed after external registration', {
      prescriptionId,
      errorName: signError instanceof Error ? signError.name : 'unknown',
    });
    return fail({ code: 'farmalink_pending_reconciliation' });
  }

  // 7. Store digitally signed PDF only
  const pdfPath = `prescriptions/${artifacts.cuir}/${artifacts.pdfFilename}`;
  const { error: uploadError } = await supabase.storage
    .from('medical-documents')
    .upload(pdfPath, finalPdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    logger.error('[issuePrescription] PDF upload failed', uploadError);
    return fail({
      code: 'pdf_upload_failed',
      details: uploadError.message || String(uploadError),
    });
  }

  const { data: urlData, error: signedUrlError } = await supabase.storage
    .from('medical-documents')
    .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);
  const signedPdfUrl = urlData?.signedUrl ?? null;

  if (signedUrlError || !signedPdfUrl) {
    logger.error('[issuePrescription] Signed PDF URL creation failed', signedUrlError);
    return fail({
      code: 'pdf_upload_failed',
      details: signedUrlError?.message || 'signed_pdf_url_missing',
    });
  }

  // 8. Update prescription record
  const { error: updateError } = await supabase
    .from('prescriptions')
    .update({
      cuir: artifacts.cuir,
      status: 'sent',
      vendor_name: vendorName,
      vendor_id: vendorId,
      qr_code_content: artifacts.qrContent,
      signed_pdf_url: signedPdfUrl,
      signature_method: signatureMethod,
      drug_category: databaseDrugCategory,
      is_controlled_substance: isControlledSubstance,
      controlled_substance_list: isControlledSubstance ? substanceCategory : null,
    })
    .eq('id', prescriptionId);

  if (updateError) {
    logger.error('[issuePrescription] Update failed', updateError);
    return fail({ code: 'update_failed', details: updateError.message || String(updateError) });
  }

  // 9. Audit only events supported by the actual PAdES and provider response.
  // Never fabricate an official national registration identifier or COMPLIANT status.
  const signatureHash = await sha256BytesHex(finalPdfBuffer);

  await supabase.from('prescription_audit_events').insert([
    {
      prescription_id: prescriptionId,
      event_type: 'ACT_DIGITAL_SIGNATURE',
      user_id: userId,
      signature_hash: signatureHash,
      metadata: {
        method: 'PAdES_AC_EXTERNAL',
        document_hash: signatureHash,
        cert_fingerprint: certFingerprint,
        version: '2.0',
      },
    },
    {
      prescription_id: prescriptionId,
      event_type: 'issued',
      user_id: userId,
      metadata: {
        cuir: artifacts.cuir,
        pdfPath,
        signature_hash: signatureHash,
        drug_category: substanceCategory,
        is_controlled_substance: isControlledSubstance,
        expires_at: expiresAt,
      },
    },
  ]);

  if (externalRegistration) {
    await supabase.from('prescription_audit_events').insert({
      prescription_id: prescriptionId,
      event_type: 'ACT_FARMALINK_ALTA',
      user_id: userId,
      metadata: {
        provider: externalRegistration.vendorName,
        vendor_id: externalRegistration.vendorId,
        response_code: externalRegistration.result.responseCode,
        response_description: externalRegistration.result.responseDescription,
        reference: externalRegistration.result.reference,
      },
    });
  }

  // 10. Create dispensation order
  const todayDate = now.split('T')[0];
  const expiryDate = expiresAt.split('T')[0];
  const { error: orderError } = await supabase.from('dispensation_orders').insert({
    prescription_id: prescriptionId,
    patient_id: rx.patient_id,
    doctor_id: rx.doctor_id,
    prescription_type: 'standard',
    medication: medicationName,
    formulation: item.presentation || item.dosage || 'No especificada',
    quantity_units: item.quantity ?? 1,
    duration_days: validityDays,
    dispense_window_start: todayDate,
    dispense_window_end: expiryDate,
    clinical_semaphore: isControlledSubstance ? 'yellow' : 'green',
    semaphore_reasons: controlledSemaphoreReasons,
    requires_clarification: false,
    internal_notes: isControlledSubstance
      ? `Medicacion controlada (${substanceCategory}). Requiere validacion farmaceutica especifica.`
      : null,
  });

  if (orderError) {
    logger.warn('[issuePrescription] Dispensation order creation failed', orderError);
  }

  logger.info('[issuePrescription] Complete', { prescriptionId, cuir: artifacts.cuir });

  return {
    ok: true,
    data: {
      cuir: artifacts.cuir,
      qrContent: artifacts.qrContent,
      signedPdfUrl,
      issuedAt: now,
      expiresAt,
      vendorName,
      vendorId,
    },
  };
}

/**
 * Temporarily refuse regeneration of already-issued PDF artifacts.
 * The previous implementation overwrote the stored signed_pdf_url target
 * with a newly generated UNSIGNED PDF and retained the original CUIR.
 * A future implementation must create an immutable, newly signed version
 * and verify both provider registration and previous document lineage.
 */
export async function regenerateIssuedPrescriptionPdf(
  _supabase: SupabaseClient,
  _prescriptionRef: string,
  _userId: string,
): Promise<Result> {
  return fail({ code: 'reissue_requires_verified_signature' });
}

export const __testables = {
  registerFarmalinkIfEnabled,
  buildFarmalinkPrescriptionMapInput,
  canIssueWithPrescriberValidationStatus,
};

