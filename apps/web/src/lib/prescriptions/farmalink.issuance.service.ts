import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerEnvOrDefault, logger } from '@autamedica/shared';
import { getRuntimeEnvValue } from '@/lib/runtime-env';
import { FarmalinkClient, resolveFarmalinkConfig } from './farmalink.client';
import { claimFarmalinkIssue, recordFarmalinkIssue } from './farmalink.issue-gate';
import { FarmalinkMappingError, buildFarmalinkAltaRecetaRequest } from './farmalink.mapper';
import type { FarmalinkAltaRecetaRequest, FarmalinkAltaResult, FarmalinkPrescriptionMapInput } from './farmalink.types';
import type { PrescriptionPdfInput } from './pdf-prescription.service';
import { sha256BytesHex, type ClinicalData, type ClinicalItem, type IssuanceError } from './prescription-issuance.shared';

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

export type PrescriberValidationStatus = 'pending' | 'valid' | 'pending_review' | 'rejected' | 'exempt';

export function canIssueWithPrescriberValidationStatus(status?: string | null): boolean {
  return status === 'valid' || status === 'exempt';
}

export interface FarmalinkRegistration {
  attemptId: string;
  vendorName: 'farmalink';
  vendorId: string;
  result: FarmalinkAltaResult;
  externalPrescription: PrescriptionPdfInput['externalPrescription'];
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

export function buildFarmalinkPrescriptionMapInput(input: {
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
        generic: readBoolean(itemConfig, ['generic', 'generico']) ?? true,
        brandRecommended: readBoolean(itemConfig, ['brandRecommended', 'brand_recommended', 'recomendacionMedica'])
          ?? Boolean(input.item.commercial_name),
      },
    ],
  };
}

export async function registerFarmalinkIfEnabled(input: {
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
  pdfInput?: PrescriptionPdfInput;
  dispensationOrder?: Record<string, unknown>;
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

  if (!client) {
    try {
      const {data:existing,error} = await input.supabase.from('farmalink_issue_attempts')
        .select('prescription_id').eq('prescription_id',input.prescriptionId).maybeSingle();
      if (existing) return {ok:false,error:{code:'farmalink_pending_reconciliation'}};
      if (error) return {ok:false,error:{code:'farmalink_idempotency_unavailable'}};
      return {ok:true,registration:null};
    } catch { return {ok:false,error:{code:'farmalink_idempotency_unavailable'}}; }
  }

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

  // Unique, durable claim is COMMITTED before reaching Farmalink.
  // If this RPC fails, do not send a request: avoid duplicate issues after
  // process crashes, multiple tabs, or HTTP 504/timeout ambiguity.
  const requestHash = await sha256BytesHex(new TextEncoder().encode(JSON.stringify(request)));
  const claim = await claimFarmalinkIssue(input.supabase, input.prescriptionId, requestHash, input.actorUserId, input.clinicalData, {
    version: 1, providerBaseUrl: resolveFarmalinkConfig().baseUrl, prescriptionId: input.prescriptionId, actorUserId: input.actorUserId,
    doctorId: input.doctor.id, clinicalData: input.clinicalData, request, pdfInput: input.pdfInput, dispensationOrder: input.dispensationOrder,
  });
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
      const explicitRejection = typeof result.responseCode === 'string' && !['00','0'].includes(result.responseCode);
      const persisted = await recordFarmalinkIssue(
        input.supabase, input.prescriptionId, attemptId, input.actorUserId, explicitRejection ? 'rejected' : 'unknown',
        undefined, result.responseCode,
      );
      if (!persisted) return { ok: false, error: { code: 'farmalink_idempotency_unavailable' } };
      if (!explicitRejection) return {ok:false,error:{code:'farmalink_pending_reconciliation'}};
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
        attemptId,
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

