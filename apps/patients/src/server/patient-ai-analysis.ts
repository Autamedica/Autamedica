import type {
  PatientAiAnalysisRequest,
  PatientAiInsightRecord,
  PatientAiInsightResult,
} from '@/types/patient-snapshot';
import {
  buildPatientAiAnalysisRequest,
  buildPatientInsights,
  syncDeterministicAlerts,
} from '@/server/patient-insights';
import { createAdminClient } from '@autamedica/auth/server';
import { ensureServerEnv, getServerEnvOrDefault, logger } from '@autamedica/shared';
import type { Database, Json, TablesInsert } from '@autamedica/types';
import type { SupabaseClient } from '@supabase/supabase-js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.4-2026-03-05';
const PROMPT_VERSION = 'patient_ai_analysis_v1';

type PatientAiInsightInsert = TablesInsert<'patient_ai_insights'>;
type PatientAiAdminClient = SupabaseClient<Database>;

interface PatientAiSyncOptions {
  patientId?: string;
  limit?: number;
  staleHours?: number;
  failedRetryMinutes?: number;
  force?: boolean;
  dryRun?: boolean;
}

interface PatientAiSyncCandidate {
  patientId: string;
  latestInsight: PatientAiInsightRow | null;
}

interface PatientAiSyncItemResult {
  patientId: string;
  action: 'generated' | 'failed' | 'skipped';
  reason: string;
  insightId?: string | null;
}

export interface PatientAiSyncCycleResult {
  startedAt: string;
  completedAt: string;
  providerConfigured: boolean;
  dryRun: boolean;
  processed: number;
  generated: number;
  failed: number;
  skipped: number;
  results: PatientAiSyncItemResult[];
}

interface PatientAiInsightRow {
  id: string;
  patient_id: string;
  provider_name: string;
  model_name: string;
  prompt_version: string;
  snapshot_version: string;
  status: 'generated' | 'failed' | 'abstained';
  response_json: Json | null;
  error_message: string | null;
  created_at: string;
}

interface PatientRow {
  id: string;
  updated_at: string | null;
}

interface PatientAiInsightsQuery<T> extends PromiseLike<{ data: T[] | null; error: unknown }> {
  eq(_column: string, _value: string): PatientAiInsightsQuery<T>;
  is(_column: string, _value: null): PatientAiInsightsQuery<T>;
  order(
    _column: string,
    _options: { ascending: boolean },
  ): PatientAiInsightsQuery<T>;
  limit(_value: number): PatientAiInsightsQuery<T>;
}

interface PatientAiInsightsGateway {
  select(_columns: string): PatientAiInsightsQuery<PatientAiInsightRow>;
  insert(_values: PatientAiInsightInsert): Promise<{ error: unknown }>;
}

interface PatientAiInsightsClient {
  from(_table: 'patient_ai_insights'): PatientAiInsightsGateway;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function decideSyncAction(
  candidate: PatientAiSyncCandidate,
  now: Date,
  options: Required<Pick<PatientAiSyncOptions, 'staleHours' | 'failedRetryMinutes' | 'force'>>,
): { shouldProcess: boolean; reason: string } {
  if (options.force) {
    return { shouldProcess: true, reason: 'forced' };
  }

  const latestInsight = candidate.latestInsight;
  if (!latestInsight) {
    return { shouldProcess: true, reason: 'missing_insight' };
  }

  const latestCreatedAt = new Date(latestInsight.created_at).getTime();
  if (Number.isNaN(latestCreatedAt)) {
    return { shouldProcess: true, reason: 'invalid_latest_timestamp' };
  }

  const ageMs = now.getTime() - latestCreatedAt;
  const staleMs = options.staleHours * 60 * 60 * 1000;
  const retryMs = options.failedRetryMinutes * 60 * 1000;

  if (latestInsight.status === 'generated') {
    return ageMs >= staleMs
      ? { shouldProcess: true, reason: 'stale_generated_insight' }
      : { shouldProcess: false, reason: 'fresh_generated_insight' };
  }

  return ageMs >= retryMs
    ? { shouldProcess: true, reason: `retry_${latestInsight.status}` }
    : { shouldProcess: false, reason: `recent_${latestInsight.status}` };
}

async function listSyncCandidates(
  admin: PatientAiAdminClient,
  options: PatientAiSyncOptions,
): Promise<PatientAiSyncCandidate[]> {
  const limit = clampInteger(options.limit ?? 25, 1, 100);

  let patientsQuery = admin
    .from('patients')
    .select('id, updated_at')
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(limit);

  if (options.patientId) {
    patientsQuery = patientsQuery.eq('id', options.patientId).limit(1);
  }

  const { data: patientRows, error: patientsError } = await patientsQuery;
  if (patientsError) {
    throw patientsError;
  }

  const patients = (patientRows ?? []) as PatientRow[];
  if (patients.length === 0) {
    return [];
  }

  const patientIds = patients.map((patient) => patient.id);
  const { data: insightRows, error: insightsError } = await admin
    .from('patient_ai_insights')
    .select(
      'id, patient_id, provider_name, model_name, prompt_version, snapshot_version, status, response_json, error_message, created_at',
    )
    .in('patient_id', patientIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (insightsError) {
    throw insightsError;
  }

  const latestByPatient = new Map<string, PatientAiInsightRow>();
  for (const row of (insightRows ?? []) as PatientAiInsightRow[]) {
    if (!latestByPatient.has(row.patient_id)) {
      latestByPatient.set(row.patient_id, row);
    }
  }

  return patients.map((patient) => ({
    patientId: patient.id,
    latestInsight: latestByPatient.get(patient.id) ?? null,
  }));
}

function buildSystemPrompt(): string {
  return [
    'Eres un analista clínico para soporte interno de un portal de pacientes.',
    'Usa solo el JSON provisto.',
    'No inventes datos.',
    'No emitas diagnósticos ni indiques tratamiento.',
    'Distingue hechos de inferencias.',
    'Si faltan datos críticos, decláralo explícitamente.',
    'Responde estrictamente en el esquema JSON pedido.',
  ].join(' ');
}

function responseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      overview: { type: 'string' },
      riskSignals: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            title: { type: 'string' },
            rationale: { type: 'string' },
          },
          required: ['severity', 'title', 'rationale'],
        },
      },
      recommendedActions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            priority: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
            },
            action: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['priority', 'action', 'reason'],
        },
      },
      patientFacingSummary: { type: 'string' },
    },
    required: ['overview', 'riskSignals', 'recommendedActions', 'patientFacingSummary'],
  };
}

function extractStructuredOutput(payload: Record<string, unknown>): PatientAiInsightResult {
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return JSON.parse(payload.output_text) as PatientAiInsightResult;
  }

  const output = Array.isArray(payload.output) ? payload.output : [];

  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const message = item as Record<string, unknown>;
    const content = Array.isArray(message.content) ? message.content : [];

    for (const entry of content) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const record = entry as Record<string, unknown>;
      if (
        (record.type === 'output_text' || record.type === 'text') &&
        typeof record.text === 'string' &&
        record.text.trim()
      ) {
        return JSON.parse(record.text) as PatientAiInsightResult;
      }
    }
  }

  throw new Error('La respuesta del modelo no incluyó contenido estructurado');
}

export function isPatientAiConfigured(): boolean {
  return Boolean(getServerEnvOrDefault('OPENAI_API_KEY'));
}

export function getPatientAiModelName(): string {
  return getServerEnvOrDefault('PATIENT_AI_MODEL', DEFAULT_MODEL) ?? DEFAULT_MODEL;
}

export async function executePatientAiAnalysis(
  request: PatientAiAnalysisRequest,
): Promise<{
  providerName: string;
  modelName: string;
  result: PatientAiInsightResult;
  rawResponse: Json;
}> {
  const apiKey = ensureServerEnv('OPENAI_API_KEY');
  const modelName = getPatientAiModelName();

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelName,
      temperature: 0,
      store: false,
      input: [
        {
          role: 'system',
          content: buildSystemPrompt(),
        },
        {
          role: 'user',
          content: JSON.stringify(request),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'patient_ai_analysis',
          strict: true,
          schema: responseSchema(),
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    logger.error('[executePatientAiAnalysis] OpenAI request failed', payload);
    throw new Error(
      typeof payload.error === 'object' && payload.error && 'message' in payload.error
        ? String((payload.error as { message?: string }).message)
        : 'No fue posible obtener el análisis IA',
    );
  }

  const result = extractStructuredOutput(payload);

  return {
    providerName: 'openai',
    modelName,
    result,
    rawResponse: payload as Json,
  };
}

export async function persistPatientAiInsight(args: {
  patientId: string;
  request: PatientAiAnalysisRequest;
  providerName: string;
  modelName: string;
  status: 'generated' | 'failed' | 'abstained';
  result: PatientAiInsightResult | null;
  errorMessage?: string | null;
}): Promise<void> {
  const admin = createAdminClient() as unknown as PatientAiInsightsClient;

  const row: PatientAiInsightInsert = {
    patient_id: args.patientId,
    snapshot_version: args.request.snapshot.version,
    provider_name: args.providerName,
    model_name: args.modelName,
    prompt_version: PROMPT_VERSION,
    status: args.status,
    request_json: args.request as unknown as Json,
    response_json: (args.result ?? null) as Json | null,
    error_message: args.errorMessage ?? null,
  };

  const { error } = await admin.from('patient_ai_insights').insert(row);
  if (error) {
    throw error;
  }
}

export async function getLatestPatientAiInsight(
  patientId: string,
): Promise<PatientAiInsightRecord | null> {
  const admin = createAdminClient() as unknown as PatientAiInsightsClient;
  const { data, error } = await admin
    .from('patient_ai_insights')
    .select('*')
    .eq('patient_id', patientId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    throw error;
  }

  const row = data?.[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    patientId: row.patient_id,
    providerName: row.provider_name,
    modelName: row.model_name,
    promptVersion: row.prompt_version,
    snapshotVersion: row.snapshot_version,
    status: row.status,
    createdAt: row.created_at,
    result: (row.response_json as PatientAiInsightResult | null) ?? null,
    errorMessage: row.error_message,
  };
}

export async function runPatientAiSyncCycle(
  options: PatientAiSyncOptions = {},
): Promise<PatientAiSyncCycleResult> {
  const startedAt = new Date().toISOString();
  const admin = createAdminClient();
  const queryAdmin = admin as unknown as PatientAiAdminClient;
  const staleHours = Math.min(Math.max(options.staleHours ?? 24, 1), 24 * 30);
  const failedRetryMinutes = clampInteger(options.failedRetryMinutes ?? 60, 5, 24 * 60);
  const dryRun = options.dryRun ?? false;
  const providerConfigured = isPatientAiConfigured();
  const now = new Date();
  const candidates = await listSyncCandidates(queryAdmin, options);
  const results: PatientAiSyncItemResult[] = [];

  for (const candidate of candidates) {
    const decision = decideSyncAction(candidate, now, {
      staleHours,
      failedRetryMinutes,
      force: options.force ?? false,
    });

    if (!decision.shouldProcess) {
      results.push({
        patientId: candidate.patientId,
        action: 'skipped',
        reason: decision.reason,
        insightId: candidate.latestInsight?.id ?? null,
      });
      continue;
    }

    try {
      const insights = await buildPatientInsights(admin, candidate.patientId);

      if (!dryRun) {
        await syncDeterministicAlerts(candidate.patientId, insights.alerts);
      }

      if (!providerConfigured) {
        results.push({
          patientId: candidate.patientId,
          action: 'skipped',
          reason: 'provider_not_configured',
          insightId: candidate.latestInsight?.id ?? null,
        });
        continue;
      }

      const request = buildPatientAiAnalysisRequest(insights);

      if (dryRun) {
        results.push({
          patientId: candidate.patientId,
          action: 'skipped',
          reason: `dry_run:${decision.reason}`,
          insightId: candidate.latestInsight?.id ?? null,
        });
        continue;
      }

      try {
        const execution = await executePatientAiAnalysis(request);
        await persistPatientAiInsight({
          patientId: candidate.patientId,
          request,
          providerName: execution.providerName,
          modelName: execution.modelName,
          status: 'generated',
          result: execution.result,
        });

        const latestInsight = await getLatestPatientAiInsight(candidate.patientId);
        results.push({
          patientId: candidate.patientId,
          action: 'generated',
          reason: decision.reason,
          insightId: latestInsight?.id ?? null,
        });
      } catch (executionError) {
        const message =
          executionError instanceof Error
            ? executionError.message
            : 'No fue posible ejecutar el análisis IA';

        await persistPatientAiInsight({
          patientId: candidate.patientId,
          request,
          providerName: 'openai',
          modelName: getPatientAiModelName(),
          status: 'failed',
          result: null,
          errorMessage: message,
        });

        results.push({
          patientId: candidate.patientId,
          action: 'failed',
          reason: message,
          insightId: null,
        });
      }
    } catch (candidateError) {
      logger.error('[runPatientAiSyncCycle] Candidate processing failed', {
        patientId: candidate.patientId,
        error: candidateError,
      });

      results.push({
        patientId: candidate.patientId,
        action: 'failed',
        reason:
          candidateError instanceof Error
            ? candidateError.message
            : 'No fue posible preparar el análisis del paciente',
        insightId: candidate.latestInsight?.id ?? null,
      });
    }
  }

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    providerConfigured,
    dryRun,
    processed: results.filter((item) => item.action !== 'skipped').length,
    generated: results.filter((item) => item.action === 'generated').length,
    failed: results.filter((item) => item.action === 'failed').length,
    skipped: results.filter((item) => item.action === 'skipped').length,
    results,
  };
}
