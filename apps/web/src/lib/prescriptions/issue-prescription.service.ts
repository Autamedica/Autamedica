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
import { FarmalinkClient } from './farmalink.client';
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
  | { code: 'care_country_mismatch_or_unset' }
  | { code: 'authorized_brazil_provider_required' }
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
  | { code: 'farmalink_rejected'; responseCode?: string };

type Result = { ok: true; data: IssuanceResult } | { ok: false; error: IssuanceError };

async function sha256BytesHex(bytes: Uint8Array): Promise<string> {
  const stableBytes = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', stableBytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function fail(error: IssuanceError): Result { return { ok: false, error }; }

function getPrescriptionStoragePath(cuir: string, signedPdfUrl?: string | null): string {
  if (signedPdfUrl) {
    try {
      const url = new URL(signedPdfUrl);
      const marker = '/medical-documents/';
      const index = url.pathname.indexOf(marker);
      if (index >= 0) {
        return decodeURIComponent(url.pathname.slice(index + marker.length));
      }
    } catch {
      // Fall back to the canonical legacy path below.
    }
  }

  return `prescriptions/${cuir}/receta-${cuir}.pdf`;
}

function resolveExternalPrescriptionForPdf(
  vendorName?: string | null,
  vendorId?: string | null,
): Parameters<typeof generatePrescriptionPdf>[0]['externalPrescription'] {
  if (vendorName !== 'farmalink' || !vendorId) return undefined;

  return {
    provider: 'farmalink',
    number: vendorId,
    displayLabel: 'RECETA FARMALINK',
    legend: 'Número de receta para validación online en farmacia',
  };
}

type UnknownRecord = Record<string, unknown>;

interface IssueDoctor {
  id: string;
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
  vendorId: string;
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

  return {
    organization: {
      id: firstText(
        readString(organization, ['id', 'idOrganizacion', 'id_organizacion']),
        readEnv(['FARMALINK_ORG_ID']),
      ) ?? '',
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
      issuerPointId: readNumber(organization, ['issuerPointId', 'issuer_point_id', 'puntoEmisorId', 'punto_emisor_id'])
        ?? readEnvNumber(['FARMALINK_PUNTO_EMISOR_ID']),
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
        tipo: firstText(
          readString(prescriber, ['licenseType', 'license_type', 'tipoMatricula', 'tipo_matricula']),
          readEnv(['FARMALINK_PRESCRIBER_LICENSE_TYPE']),
          input.doctor.enrollment_entity,
          'MN',
        ) ?? 'MN',
        provincia: firstText(
          readString(prescriber, ['licenseProvince', 'license_province', 'provincia']),
          readEnv(['FARMALINK_PRESCRIBER_LICENSE_PROVINCE']),
          input.doctor.enrollment_jurisdiction,
          'C',
        ) ?? 'C',
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
        generic: readBoolean(itemConfig, ['generic', 'generico']) ?? true,
        brandRecommended: readBoolean(itemConfig, ['brandRecommended', 'brand_recommended', 'recomendacionMedica'])
          ?? Boolean(input.item.commercial_name),
      },
    ],
  };
}

async function registerFarmalinkIfEnabled(input: {
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
  } catch (error) {
    logger.error('[issuePrescription] Farmalink mapping failed', {
      field: error instanceof FarmalinkMappingError ? error.field : undefined,
      error: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: { code: 'farmalink_mapping_failed' } };
  }

  try {
    const result = await client.altaReceta(request);
    if (!result.approved || !result.nroRecElectronica) {
      logger.warn('[issuePrescription] Farmalink rejected AltaReceta', {
        responseCode: result.responseCode,
        responseDescription: result.responseDescription,
        reference: result.reference,
      });
      return {
        ok: false,
        error: { code: 'farmalink_rejected', responseCode: result.responseCode },
      };
    }

    return {
      ok: true,
      registration: {
        vendorName: 'farmalink',
        vendorId: result.nroRecElectronica,
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
    logger.error('[issuePrescription] Farmalink AltaReceta failed', {
      name: error instanceof Error ? error.name : undefined,
      message: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: { code: 'farmalink_registration_failed' } };
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
): Promise<Result> {
  // 1. Resolve and validate doctor
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, active, care_country, license_number, license_type, uf_brazil, rqe_number, cpf, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address, signature_image_url, stamp_image_url, care_guide_template')
    .eq('user_id', userId)
    .maybeSingle();

  if (!doctor?.active) return fail({ code: 'doctor_not_found' });
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

  // Jurisdiction is persisted explicitly; credentials and locale cannot choose it.
  const prescriptionCountry = rx.country_code;
  if (!['AR', 'BR'].includes(prescriptionCountry ?? '') || doctor.care_country !== prescriptionCountry ||
      (prescriptionCountry === 'AR' && !['MN', 'MP'].includes(doctor.license_type ?? '')) ||
      (prescriptionCountry === 'BR' && (doctor.license_type !== 'CRM' || !/^[A-Z]{2}$/.test(doctor.uf_brazil ?? '')))) {
    return fail({ code: 'care_country_mismatch_or_unset' });
  }
  // This internal PDF renderer is not the authorized Memed issuance pipeline.
  // Keep BR issuance on its provider-specific route; no fallback to an internal QR.
  if (prescriptionCountry === 'BR') return fail({ code: 'authorized_brazil_provider_required' });

  const { data: profile } = await supabase
    .from('profiles')
    .select('sss_validation_status, role, active')
    .eq('user_id', userId)
    .single();

  if (!profile?.active || profile.role !== 'doctor') return fail({ code: 'prescriber_validation_required' });

  // Validate prescriber according to country regulations
  if (prescriptionCountry === 'AR') {
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
    .select('user_id, active, care_country, dni, cuil, cpf, cns, address, birth_date, gender, insurance_info')
    .eq('id', rx.patient_id)
    .single();

  if (!patient?.active) return fail({ code: 'patient_not_found' });
  if (patient.care_country !== prescriptionCountry) return fail({ code: 'care_country_mismatch_or_unset' });
  // 4. Parse clinical data
  const clinicalData = rx.clinical_data as ClinicalData;
  const externalPatient = clinicalData?.external_patient;
  
  const hasPatientId = patient.dni
    || patient.cuil
    || (patient as { cpf?: string }).cpf
    || (patient as { ci?: string }).ci
    || externalPatient?.dni
    || externalPatient?.cuil
    || (externalPatient as { cpf?: string })?.cpf
    || (externalPatient as { ci?: string })?.ci;

  if (!hasPatientId) {
    return fail({ code: 'missing_patient_identification' });
  }
  if (!patient.address && !externalPatient?.address) return fail({ code: 'missing_patient_address' });

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

  let externalRegistration: FarmalinkRegistration | undefined;
  if (prescriptionCountry === 'AR') {
    const farmalinkRegistration = await registerFarmalinkIfEnabled({
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

  const vendorName = externalRegistration?.vendorName ?? 'autamedica_internal';
  const vendorId = externalRegistration?.vendorId ?? `am-${Date.now()}`;

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
          address: patient.address || externalPatient?.address,
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
          commercialName: item.commercial_name,
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
          cuil: patient.cuil ?? externalPatient?.cuil ?? undefined,
          dateOfBirth: patient.birth_date ?? externalPatient?.birth_date ?? undefined,
          sex: patient.gender ?? externalPatient?.gender ?? undefined,
          insurancePlan: resolveInsurancePlan(patient.insurance_info),
          address: patient.address ?? externalPatient?.address ?? undefined,
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

  // 6b. Attempt PAdES digital signing if doctor has a certificate
  let finalPdfBuffer = artifacts.pdfBuffer;
  let signatureMethod = 'electronic_simple';
  let certFingerprint: string | null = null;

  try {
    const activeCert = await getActiveCertificate(supabase, doctor.id);
    if (activeCert) {
      const { p12Buffer, password } = await loadSigningCredentials(
        supabase,
        doctor.id,
        activeCert.certFingerprint,
      );
      // Dynamic import: @signpdf depends on Node.js APIs not available in Cloudflare Workers
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
      signatureMethod = 'ac_external';
      certFingerprint = activeCert.certFingerprint;
      logger.info('[issuePrescription] PDF signed with PAdES', { cuir: artifacts.cuir });
    }
  } catch (signError) {
    logger.warn('[issuePrescription] PAdES signing failed, using electronic_simple', signError);
  }

  // 7. Store PDF (signed if PAdES succeeded, unsigned otherwise)
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

  // 9. Audit events (batched)
  const signatureHash = await sha256BytesHex(finalPdfBuffer);

  await supabase.from('prescription_audit_events').insert([
    {
      prescription_id: prescriptionId,
      event_type: 'ACT_DIGITAL_SIGNATURE',
      user_id: userId,
      signature_hash: signatureHash,
      metadata: {
        method: signatureMethod === 'ac_external' ? 'PAdES_SELF_SIGNED' : 'ELECTRONIC_SIMPLE',
        document_hash: signatureHash,
        cert_fingerprint: certFingerprint,
        version: '2.0',
      },
    },
    {
      prescription_id: prescriptionId,
      event_type: 'ACT_RCTA_REGISTRATION',
      user_id: userId,
      metadata: {
        cuir: artifacts.cuir,
        registration_id: `AR-RCTA-${artifacts.cuir}`,
        jurisdiction: doctor.enrollment_jurisdiction || 'CENTRAL',
        status: 'COMPLIANT',
        drug_category: substanceCategory,
        is_controlled_substance: isControlledSubstance,
        validity_days: validityDays,
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

export async function regenerateIssuedPrescriptionPdf(
  supabase: SupabaseClient,
  prescriptionRef: string,
  userId: string,
): Promise<Result> {
  const { data: doctor } = await supabase
    .from('doctors')
    .select('id, license_number, specialty, refeps_id, enrollment_entity, enrollment_jurisdiction, professional_address, signature_image_url, stamp_image_url, care_guide_template')
    .eq('user_id', userId)
    .single();

  if (!doctor) return fail({ code: 'doctor_not_found' });
  if (!doctor.license_number) return fail({ code: 'missing_license_number' });
  if (!doctor.refeps_id) return fail({ code: 'missing_refeps_id' });
  if (!doctor.professional_address) return fail({ code: 'missing_professional_address' });

  const prescriptionQuery = supabase
    .from('prescriptions')
    .select('id, doctor_id, patient_id, status, clinical_data, cuir, signed_pdf_url, vendor_name, vendor_id')
    .limit(1);

  const { data: rows } = prescriptionRef.startsWith('AM-') || prescriptionRef.startsWith('AR-')
    ? await prescriptionQuery.eq('cuir', prescriptionRef)
    : await prescriptionQuery.eq('id', prescriptionRef);
  const rx = rows?.[0];

  if (!rx) return fail({ code: 'prescription_not_found' });
  if (rx.doctor_id !== doctor.id) return fail({ code: 'not_your_prescription' });
  if (!rx.cuir) return fail({ code: 'missing_cuir' });

  const { data: patient } = await supabase
    .from('patients')
    .select('user_id, dni, cuil, address, birth_date, gender, insurance_info')
    .eq('id', rx.patient_id)
    .single();

  if (!patient) return fail({ code: 'patient_not_found' });

  const clinicalData = rx.clinical_data as ClinicalData;
  const externalPatient = clinicalData?.external_patient;
  if (!patient.dni && !patient.cuil && !externalPatient?.dni && !externalPatient?.cuil) {
    return fail({ code: 'missing_patient_identification' });
  }
  if (!patient.address && !externalPatient?.address) return fail({ code: 'missing_patient_address' });

  const item = clinicalData?.items?.[0];
  if (!item?.generic_name) return fail({ code: 'no_medication' });

  const patientName = externalPatient?.name?.trim()
    || (patient.user_id ? await resolveProfileName(supabase, patient.user_id, '') : 'Paciente');
  const doctorName = await resolveProfileName(supabase, userId, 'Dr.');
  const now = new Date().toISOString();
  const validityDays = getValidityPeriodDays(item.generic_name);
  const expiresAt = addDays(new Date(now), validityDays).toISOString();

  const artifacts = await generatePrescriptionPdf({
    prescriptionId: rx.id,
    existingCuir: rx.cuir,
    externalPrescription: resolveExternalPrescriptionForPdf(rx.vendor_name, rx.vendor_id),
    medication: {
      genericName: item.generic_name,
      commercialName: item.commercial_name,
      dosage: item.dosage ?? '',
      presentation: item.presentation ?? '',
      quantity: item.quantity ?? 0,
      instructions: item.instructions ?? '',
    },
    diagnosis: clinicalData.diagnosis ?? '',
    notes: clinicalData.notes,
    patient: {
      name: patientName,
      dni: patient.dni ?? externalPatient?.dni ?? undefined,
      cuil: patient.cuil ?? externalPatient?.cuil ?? undefined,
      dateOfBirth: patient.birth_date ?? externalPatient?.birth_date ?? undefined,
      sex: patient.gender ?? externalPatient?.gender ?? undefined,
      insurancePlan: resolveInsurancePlan(patient.insurance_info),
      address: patient.address ?? externalPatient?.address ?? undefined,
    },
    prescriber: {
      name: doctorName,
      license: doctor.license_number,
      licenseJurisdiction: doctor.enrollment_jurisdiction ?? undefined,
      licenseEntity: doctor.enrollment_entity ?? undefined,
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

  const pdfPath = getPrescriptionStoragePath(rx.cuir, rx.signed_pdf_url);
  const { error: uploadError } = await supabase.storage
    .from('medical-documents')
    .upload(pdfPath, artifacts.pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    });

  if (uploadError) {
    logger.warn('[regenerateIssuedPrescriptionPdf] PDF upload failed', uploadError);
    return fail({ code: 'pdf_upload_failed', details: uploadError.message || String(uploadError) });
  }

  const { data: urlData } = await supabase.storage
    .from('medical-documents')
    .createSignedUrl(pdfPath, 365 * 24 * 60 * 60);
  const signedPdfUrl = urlData?.signedUrl ?? rx.signed_pdf_url ?? null;

  const { error: updateError } = await supabase
    .from('prescriptions')
    .update({
      qr_code_content: artifacts.qrContent,
      signed_pdf_url: signedPdfUrl,
    })
    .eq('id', rx.id);

  if (updateError) {
    logger.error('[regenerateIssuedPrescriptionPdf] Update failed', updateError);
    return fail({ code: 'update_failed', details: updateError.message || String(updateError) });
  }

  await supabase.from('prescription_audit_events').insert({
    prescription_id: rx.id,
    event_type: 'pdf_regenerated',
    user_id: userId,
    metadata: {
      cuir: artifacts.cuir,
      pdfPath,
      reason: 'refresh_prescription_artifact_template',
    },
  });

  return {
    ok: true,
    data: {
      cuir: artifacts.cuir,
      qrContent: artifacts.qrContent,
      signedPdfUrl,
      issuedAt: now,
      expiresAt,
      vendorName: rx.vendor_name,
      vendorId: rx.vendor_id ?? '',
    },
  };
}

export const __testables = {
  buildFarmalinkPrescriptionMapInput,
  canIssueWithPrescriberValidationStatus,
};

