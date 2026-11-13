/**
 * Growth Agent Worker
 *
 * First production slice:
 * - claims durable Concierge jobs from growth_os.agent_jobs
 * - builds one contextual patient-acquisition message
 * - validates it against growth_os.medical_claims_patterns
 * - checks consent and channel killswitch immediately before delivery
 * - records every stage in growth_os.agent_runs
 */

import { createClient } from '@supabase/supabase-js';
import { DEFAULT_OPENCLAW_CONFIG, sendMessageWithFallback, type OpenClawConfig } from '@autamedica/scheduling';
import { getServerEnvOrDefault, logger } from '@autamedica/shared';

type AgentJobStatus = 'blocked' | 'ready' | 'sent' | 'failed' | 'cancelled';
type AgentChannel = 'whatsapp_openclaw' | 'whatsapp_business_api' | 'email_resend' | 'email_brevo' | 'admin_report';
type AgentCapability = 'dry_run_outbound' | 'send_whatsapp' | 'enqueue_email' | 'send_admin_report' | 'write_growth_events';

interface AgentJob {
  id: string;
  agent_type: 'concierge' | 'compliance_auditor' | 'waiting_room_guardian' | 'data_integrity_sync';
  trigger_type: string;
  source_table: string | null;
  source_id: string | null;
  lead_id: string | null;
  appointment_id: string | null;
  channel: AgentChannel;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  idempotency_key: string;
}

interface LeadRecord {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  vertical: string;
  intent: string;
  status: string;
  consent_marketing: boolean;
  metadata: Record<string, unknown>;
}

interface ClaimPattern {
  id: number;
  pattern: string;
  severity: 'block' | 'flag';
  category: string | null;
  note: string | null;
}

interface ConciergeDecision {
  channel: AgentChannel;
  recipient: string;
  message: string;
  rationale: string;
  promptVersion: string;
}

interface ComplianceResult {
  verdict: 'pass' | 'flag' | 'block';
  matches: Array<{
    patternId: number;
    severity: 'block' | 'flag';
    category: string | null;
    note: string | null;
  }>;
}

interface CapabilityAuthorization {
  allowed: boolean;
  agentType: AgentJob['agent_type'];
  capability: AgentCapability;
  channel: AgentChannel | null;
  reason: string;
}

interface WorkerConfig {
  openclaw: OpenClawConfig;
  batchSize: number;
  dryRun: boolean;
  intervalMs: number;
}

const SUPABASE_URL = getServerEnvOrDefault('SUPABASE_URL');
const SUPABASE_KEY = getServerEnvOrDefault('SUPABASE_SERVICE_ROLE_KEY');
const OPENCLAW_URL = getServerEnvOrDefault('OPENCLAW_URL') ?? DEFAULT_OPENCLAW_CONFIG.baseUrl;
const OPENCLAW_TOKEN = getServerEnvOrDefault('OPENCLAW_TOKEN') ?? '';
const OPENCLAW_ACCOUNT = getServerEnvOrDefault('OPENCLAW_ACCOUNT') ?? 'autamedica';
// Operational mode is read live from public.platform_operational_switches; no environment flag owns it.
const DRY_RUN = false;
const INTERVAL_MS = parseInt(getServerEnvOrDefault('GROWTH_AGENT_INTERVAL_MS') ?? '60000', 10);
const BATCH_SIZE = parseInt(getServerEnvOrDefault('GROWTH_AGENT_BATCH_SIZE') ?? '25', 10);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const config: WorkerConfig = {
  openclaw: {
    baseUrl: OPENCLAW_URL,
    token: OPENCLAW_TOKEN,
    defaultChannel: 'whatsapp',
    accountId: OPENCLAW_ACCOUNT,
  },
  batchSize: Number.isFinite(BATCH_SIZE) ? BATCH_SIZE : 25,
  dryRun: DRY_RUN,
  intervalMs: Number.isFinite(INTERVAL_MS) ? INTERVAL_MS : 60000,
};

const TELEGRAM_BOT_TOKEN = getServerEnvOrDefault('GROWTH_TELEGRAM_BOT_TOKEN');
const TELEGRAM_CHAT_ID = getServerEnvOrDefault('GROWTH_TELEGRAM_CHAT_ID');

async function notifyTelegram(message: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    return;
  }
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      logger.error('Failed to send Telegram growth notification', { status: response.status, error: errText });
    }
  } catch (error) {
    logger.error('Error sending Telegram growth notification', { error });
  }
}


console.log('🏥 AutaMedica Growth Agent Worker starting...');
console.log(`   Supabase: ${SUPABASE_URL}`);
console.log(`   OpenClaw: ${OPENCLAW_URL} (account: ${OPENCLAW_ACCOUNT})`);
console.log(`   Dry Run: ${config.dryRun}`);
console.log(`   Interval: ${config.intervalMs}ms`);
console.log('');

async function tick(): Promise<void> {
  try {
    const result = await processGrowthAgentCycle(config);

    if (result.processed > 0 || result.errors.length > 0) {
      console.log(
        `[${new Date().toISOString()}] Processed: ${result.processed} | Sent: ${result.sent} | Blocked: ${result.blocked} | Failed: ${result.failed}`,
      );
    }

    for (const error of result.errors) {
      console.error(`  ❌ ${error}`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Growth agent worker error:`, error);
  }
}

async function processGrowthAgentCycle(workerConfig: WorkerConfig): Promise<{
  processed: number;
  sent: number;
  blocked: number;
  failed: number;
  errors: string[];
}> {
  const jobs = await claimDueJobs(workerConfig.batchSize);
  const result = {
    processed: jobs.length,
    sent: 0,
    blocked: 0,
    failed: 0,
    errors: [] as string[],
  };

  for (const job of jobs) {
    try {
      const status = await processOneJob(job, workerConfig);
      if (status === 'sent' || status === 'ready') {
        result.sent++;
      } else if (status === 'blocked' || status === 'cancelled') {
        result.blocked++;
      } else {
        result.failed++;
      }
    } catch (error) {
      result.failed++;
      const message = error instanceof Error ? error.message : 'Unknown growth agent error';
      result.errors.push(`Job ${job.id}: ${message}`);
      await updateJob(job.id, 'failed', message);
    }
  }

  return result;
}

async function claimDueJobs(batchSize: number): Promise<AgentJob[]> {
  const { data, error } = await supabase
    .schema('growth_os')
    .rpc('claim_due_agent_jobs', { batch_size: batchSize });

  if (error) {
    throw new Error(`Could not claim growth agent jobs: ${error.message}`);
  }

  return (data ?? []) as AgentJob[];
}

async function processOneJob(job: AgentJob, workerConfig: WorkerConfig): Promise<AgentJobStatus> {
  if (job.agent_type !== 'concierge') {
    await recordRun(job.id, 'report', {}, { skipped: true, reason: 'unsupported_agent_type' });
    await updateJob(job.id, 'cancelled', `Unsupported agent type: ${job.agent_type}`);
    return 'cancelled';
  }

  const lead = await loadLead(job);
  if (!lead) {
    await updateJob(job.id, 'cancelled', 'Lead no longer exists');
    return 'cancelled';
  }

  const decision = buildConciergeDecision(job, lead);
  const operationalSwitches = await loadOperationalSwitches();
  const liveWorkerConfig = { ...workerConfig, dryRun: operationalSwitches.dry_run_enabled };
  await recordRun(
    job.id,
    'reason',
    { job, lead: redactLeadForLog(lead) },
    {
      channel: decision.channel,
      recipient: decision.recipient,
      message: decision.message,
      rationale: decision.rationale,
    },
    { promptVersion: decision.promptVersion },
  );

  const compliance = await validateCompliance(decision.message);
  await recordRun(
    job.id,
    'validate',
    { message: decision.message },
    { verdict: compliance.verdict },
    { complianceResult: compliance },
  );

  if (compliance.verdict === 'flag') {
    const { error: approvalError } = await supabase.from('admin_approval_decisions').insert({
      domain: 'comms', status: 'PENDING_HUMAN_APPROVAL', proposed_by: 'growth-agent-worker',
      summary: `Growth message held for human review: ${job.id}`,
      risk_reason: compliance.matches.map((match) => match.note ?? match.category ?? 'Compliance flag').join('; ').slice(0, 2000),
      impact_scope: `Outbound message to lead ${lead.id} via ${decision.channel}`,
      payload: { action: 'growth_agent_job', jobId: job.id, leadId: lead.id, channel: decision.channel,
        recipient: decision.recipient, message: decision.message, rationale: decision.rationale, complianceResult: compliance },
    })
    if (approvalError) {
      await updateJob(job.id, 'blocked', 'Compliance flag; approval inbox insert failed')
      throw new Error(`Could not queue human approval: ${approvalError.message}`)
    }
    await updateJob(job.id, 'blocked', 'Awaiting human approval for compliance flag')
    await recordRun(job.id, 'deliver', { channel: decision.channel }, { skipped: true, reason: 'pending_human_approval' },
      { approvalRequired: true, complianceResult: compliance })
    return 'blocked'
  }

  if (compliance.verdict === 'block') {
    await updateJob(job.id, 'blocked', 'Compliance blocked outbound message');
    await notifyTelegram(
      `⚠️ *ANMAT / Compliance Block*\n` +
      `Se bloqueó un mensaje saliente para el lead *${lead.name ?? 'Sin nombre'}* (${lead.phone ?? lead.email}) en la vertical *${lead.vertical}*.\n` +
      `*Motivo:* Coincidencia con patrones de claims prohibidos.\n` +
      `*Mensaje bloqueado:* "${decision.message}"`
    );
    return 'blocked';
  }

  const deliverable = await validateDeliveryReadiness(lead, decision, operationalSwitches);
  if (!deliverable.ok) {
    await recordRun(job.id, 'deliver', { channel: decision.channel }, { skipped: true, reason: deliverable.reason });
    await updateJob(job.id, 'cancelled', deliverable.reason);
    return 'cancelled';
  }

  const deliveryCapability = await authorizeDeliveryCapability(job, decision, liveWorkerConfig.dryRun);
  if (!deliveryCapability.allowed) {
    await recordRun(
      job.id,
      'deliver',
      { channel: decision.channel, dryRun: workerConfig.dryRun },
      { skipped: true, reason: deliveryCapability.reason, capability_authorization: deliveryCapability },
    );
    await updateJob(job.id, 'cancelled', deliveryCapability.reason);
    return 'cancelled';
  }

  if (liveWorkerConfig.dryRun) {
    logger.info(`[GROWTH AGENT DRY RUN] ${decision.channel} -> ${decision.recipient}\n${decision.message}`);
    await recordGrowthEvent(lead, 'agent.concierge.dry_run', job, decision);
    await recordRun(
      job.id,
      'deliver',
      { channel: decision.channel, dryRun: true },
      { ok: true, dryRun: true, capability_authorization: deliveryCapability },
    );
    await updateJob(job.id, 'ready');
    await notifyTelegram(
      `🧪 *AutaMedica Growth Agent [DRY RUN]*\n` +
      `*Lead:* ${lead.name ?? 'Sin nombre'} (${lead.phone ?? lead.email})\n` +
      `*Vertical:* ${lead.vertical} (Intento: ${lead.intent})\n` +
      `*Canal:* ${decision.channel}\n` +
      `*Mensaje:* "${decision.message}"`
    );
    return 'ready';
  }

  const providerResult = await deliverMessage(decision, liveWorkerConfig);
  await recordRun(
    job.id,
    'deliver',
    { channel: decision.channel },
    { ok: providerResult.ok, capability_authorization: deliveryCapability },
    { providerResult: { ...providerResult, capability_authorization: deliveryCapability } },
  );

  if (!providerResult.ok) {
    await updateJob(job.id, 'failed', providerResult.error ?? 'Provider send failed');
    await notifyTelegram(
      `❌ *Error de Envío en Adquisición*\n` +
      `No se pudo enviar el mensaje para *${lead.name ?? 'Sin nombre'}* (${lead.phone ?? lead.email}).\n` +
      `*Canal:* ${decision.channel}\n` +
      `*Error:* ${providerResult.error ?? 'Error desconocido del proveedor'}`
    );
    return 'failed';
  }

  await recordGrowthEvent(lead, 'agent.concierge.sent', job, decision);
  await updateJob(job.id, 'sent');
  await notifyTelegram(
    `🚀 *Mensaje de Adquisición Enviado!*\n` +
    `*Paciente:* ${lead.name ?? 'Sin nombre'} (${lead.phone ?? lead.email})\n` +
    `*Vertical:* ${lead.vertical} (${lead.intent})\n` +
    `*Canal:* ${decision.channel}\n` +
    `*Mensaje:* "${decision.message}"`
  );
  return 'sent';
}

async function loadLead(job: AgentJob): Promise<LeadRecord | null> {
  if (!job.lead_id) {
    return null;
  }

  const { data, error } = await supabase
    .schema('growth_os')
    .from('leads')
    .select('id,email,name,phone,vertical,intent,status,consent_marketing,metadata')
    .eq('id', job.lead_id)
    .single();

  if (error) {
    throw new Error(`Could not load lead ${job.lead_id}: ${error.message}`);
  }

  return data as LeadRecord;
}

function buildConciergeDecision(job: AgentJob, lead: LeadRecord): ConciergeDecision {
  const channel = lead.phone ? 'whatsapp_openclaw' : job.channel;
  const recipient = channel === 'whatsapp_openclaw' ? lead.phone ?? '' : lead.email;
  const patientName = firstName(lead.name) ?? 'Hola';
  const verticalLabel = normalizeVerticalLabel(lead.vertical);
  const nextAction = inferNextAction(lead);

  const message = [
    patientName === 'Hola' ? 'Hola, soy de AutaMedica.' : `Hola ${patientName}, soy de AutaMedica.`,
    `Vi tu interés en ${verticalLabel}.`,
    nextAction,
    '¿Querés que te deje el link para continuar?',
  ].join(' ');

  return {
    channel,
    recipient,
    message,
    rationale: `lead_status=${lead.status}; vertical=${lead.vertical}; next_action=${nextAction}`,
    promptVersion: 'concierge-rule-v1',
  };
}

function inferNextAction(lead: LeadRecord): string {
  const metadata = lead.metadata ?? {};
  const anamnesisStatus = stringFromMetadata(metadata, 'anamnesis_status');
  const completedQuestions = numberFromMetadata(metadata, 'anamnesis_completed_questions');
  const totalQuestions = numberFromMetadata(metadata, 'anamnesis_total_questions');

  if (anamnesisStatus === 'completed' || lead.status === 'qualified') {
    return 'Ya tenemos tu evaluación inicial y el próximo paso es coordinar un turno con un profesional.';
  }

  if (completedQuestions !== null && totalQuestions !== null && completedQuestions < totalQuestions) {
    const remaining = totalQuestions - completedQuestions;
    return `Te faltan ${remaining} ${remaining === 1 ? 'pregunta' : 'preguntas'} para completar la evaluación inicial.`;
  }

  if (lead.status === 'nurturing') {
    return 'Podés retomar la evaluación inicial para que el equipo médico tenga mejor contexto antes del turno.';
  }

  return 'Podés empezar la evaluación inicial y avanzar hacia una consulta con un profesional.';
}

async function validateCompliance(message: string): Promise<ComplianceResult> {
  const { data, error } = await supabase
    .schema('growth_os')
    .from('medical_claims_patterns')
    .select('id,pattern,severity,category,note')
    .eq('enabled', true);

  if (error) {
    throw new Error(`Could not load compliance patterns: ${error.message}`);
  }

  const matches: ComplianceResult['matches'] = [];
  for (const pattern of (data ?? []) as ClaimPattern[]) {
    if (matchesPattern(message, pattern.pattern)) {
      matches.push({
        patternId: pattern.id,
        severity: pattern.severity,
        category: pattern.category,
        note: pattern.note,
      });
    }
  }

  if (matches.some((match) => match.severity === 'block')) {
    return { verdict: 'block', matches };
  }

  if (matches.length > 0) {
    return { verdict: 'flag', matches };
  }

  return { verdict: 'pass', matches };
}

function matchesPattern(message: string, rawPattern: string): boolean {
  const caseInsensitive = rawPattern.startsWith('(?i)');
  const source = caseInsensitive ? rawPattern.slice(4) : rawPattern;

  try {
    return new RegExp(source, caseInsensitive ? 'i' : undefined).test(message);
  } catch (error) {
    logger.warn('Invalid compliance regex pattern', { rawPattern, error });
    return false;
  }
}

type OperationalSwitches = {
  jordan_qr_payments_enabled: boolean;
  pharmacy_express_payments_enabled: boolean;
  global_pix_mp_payments_enabled: boolean;
  whatsapp_send_enabled: boolean;
  email_send_enabled: boolean;
  dry_run_enabled: boolean;
  updated_by: string | null;
  updated_at: string;
};

async function loadOperationalSwitches(): Promise<OperationalSwitches> {
  const { data, error } = await supabase
    .from('platform_operational_switches')
    .select('jordan_qr_payments_enabled,pharmacy_express_payments_enabled,global_pix_mp_payments_enabled,whatsapp_send_enabled,email_send_enabled,dry_run_enabled,updated_by,updated_at')
    .eq('id', 'global')
    .single();
  if (error || !data) {
    throw new Error(`Could not load operational switches: ${error?.message ?? 'global row missing'}`);
  }
  return data as OperationalSwitches;
}

async function validateDeliveryReadiness(
  lead: LeadRecord,
  decision: ConciergeDecision,
  switches: OperationalSwitches,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!lead.consent_marketing) {
    return { ok: false, reason: 'Lead has no marketing consent' };
  }

  if (lead.status === 'unsubscribed') {
    return { ok: false, reason: 'Lead is unsubscribed' };
  }

  if (!decision.recipient) {
    return { ok: false, reason: `Missing recipient for ${decision.channel}` };
  }

  const channelEnabled = decision.channel === 'whatsapp_openclaw' || decision.channel === 'whatsapp_business_api'
    ? switches.whatsapp_send_enabled
    : switches.email_send_enabled;
  if (!switches.dry_run_enabled && !channelEnabled) {
    return { ok: false, reason: `Channel disabled in Admin: ${decision.channel}` };
  }

  if (decision.channel !== 'whatsapp_openclaw' && decision.channel !== 'email_resend') {
    return { ok: false, reason: `Channel not implemented in worker: ${decision.channel}` };
  }

  return { ok: true };
}

async function authorizeDeliveryCapability(
  job: AgentJob,
  decision: ConciergeDecision,
  dryRun: boolean,
): Promise<CapabilityAuthorization> {
  const capability = resolveDeliveryCapability(decision.channel, dryRun);
  if (!capability) {
    return {
      allowed: false,
      agentType: job.agent_type,
      capability: 'send_admin_report',
      channel: decision.channel,
      reason: `No capability mapping for ${decision.channel}`,
    };
  }

  return authorizeCapability(job.agent_type, capability, decision.channel);
}

async function authorizeCapability(
  agentType: AgentJob['agent_type'],
  capability: AgentCapability,
  channel: AgentChannel | null,
): Promise<CapabilityAuthorization> {
  if (capability === 'dry_run_outbound' || capability === 'send_whatsapp' || capability === 'enqueue_email') {
    const switches = await loadOperationalSwitches();
    const enabled = capability === 'dry_run_outbound'
      ? switches.dry_run_enabled
      : capability === 'send_whatsapp'
        ? switches.whatsapp_send_enabled
        : switches.email_send_enabled;
    return {
      allowed: enabled,
      agentType,
      capability,
      channel,
      reason: enabled ? 'Authorized by public.platform_operational_switches' : 'Disabled by Admin operational switch',
    };
  }

  const query = supabase
    .schema('growth_os')
    .from('agent_capabilities')
    .select('enabled,reason')
    .eq('agent_type', agentType)
    .eq('capability', capability);

  const scopedQuery = channel === null ? query.is('channel', null) : query.eq('channel', channel);
  const { data, error } = await scopedQuery.maybeSingle();

  if (error) {
    throw new Error(`Could not authorize capability ${capability}: ${error.message}`);
  }

  if (!data?.enabled) {
    return {
      allowed: false,
      agentType,
      capability,
      channel,
      reason: `Capability disabled or missing: ${agentType}.${capability}${channel ? `.${channel}` : ''}`,
    };
  }

  return {
    allowed: true,
    agentType,
    capability,
    channel,
    reason: data.reason ?? 'Capability enabled',
  };
}

function resolveDeliveryCapability(
  channel: AgentChannel,
  dryRun: boolean,
): AgentCapability | null {
  if (dryRun) {
    return 'dry_run_outbound';
  }

  if (channel === 'whatsapp_openclaw' || channel === 'whatsapp_business_api') {
    return 'send_whatsapp';
  }

  if (channel === 'email_resend' || channel === 'email_brevo') {
    return 'enqueue_email';
  }

  if (channel === 'admin_report') {
    return 'send_admin_report';
  }

  return null;
}

async function deliverMessage(
  decision: ConciergeDecision,
  workerConfig: WorkerConfig,
): Promise<{ ok: boolean; error?: string; raw?: string }> {
  if (decision.channel === 'whatsapp_openclaw') {
    return sendMessageWithFallback(workerConfig.openclaw, {
      to: decision.recipient,
      message: decision.message,
      channel: 'whatsapp',
    });
  }

  return {
    ok: false,
    error: `Delivery adapter is not implemented for ${decision.channel}`,
  };
}

async function recordRun(
  jobId: string,
  stage: 'reason' | 'validate' | 'deliver' | 'report',
  inputSnapshot: Record<string, unknown>,
  outputSnapshot: Record<string, unknown>,
  options: {
    promptVersion?: string;
    complianceResult?: ComplianceResult;
    providerResult?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const { error } = await supabase
    .schema('growth_os')
    .from('agent_runs')
    .insert({
      job_id: jobId,
      stage,
      prompt_version: options.promptVersion ?? null,
      input_snapshot: inputSnapshot,
      output_snapshot: outputSnapshot,
      compliance_result: options.complianceResult ?? {},
      provider_result: options.providerResult ?? {},
    });

  if (error) {
    throw new Error(`Could not record agent run: ${error.message}`);
  }
}

async function updateJob(jobId: string, status: AgentJobStatus, lastError?: string): Promise<void> {
  const { error } = await supabase
    .schema('growth_os')
    .from('agent_jobs')
    .update({
      status,
      last_error: lastError ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (error) {
    throw new Error(`Could not update agent job ${jobId}: ${error.message}`);
  }
}

async function recordGrowthEvent(
  lead: LeadRecord,
  eventType: string,
  job: AgentJob,
  decision: ConciergeDecision,
): Promise<void> {
  const eventCapability = await authorizeCapability(job.agent_type, 'write_growth_events', null);
  if (!eventCapability.allowed) {
    await recordRun(
      job.id,
      'report',
      { event_type: eventType },
      { skipped: true, reason: eventCapability.reason, capability_authorization: eventCapability },
    );
    return;
  }

  const { error } = await supabase
    .schema('growth_os')
    .from('growth_events')
    .insert({
      event_type: eventType,
      lead_id: lead.id,
      vertical: lead.vertical,
      metadata: {
        agent_job_id: job.id,
        idempotency_key: job.idempotency_key,
        channel: decision.channel,
        prompt_version: decision.promptVersion,
        capability_authorization: eventCapability,
      },
    });

  if (error) {
    throw new Error(`Could not record growth event: ${error.message}`);
  }
}

function normalizeVerticalLabel(vertical: string): string {
  const normalized = vertical.trim().toLowerCase();
  if (normalized.includes('tdah')) {
    return 'TDAH';
  }
  if (normalized.includes('insom')) {
    return 'insomnio';
  }
  if (normalized === 'general') {
    return 'tu salud';
  }
  return vertical;
}

function firstName(name: string | null): string | null {
  const trimmed = name?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed.split(/\s+/)[0] ?? null;
}

function stringFromMetadata(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === 'string' ? value : null;
}

function numberFromMetadata(metadata: Record<string, unknown>, key: string): number | null {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function redactLeadForLog(lead: LeadRecord): Record<string, unknown> {
  return {
    id: lead.id,
    vertical: lead.vertical,
    intent: lead.intent,
    status: lead.status,
    consent_marketing: lead.consent_marketing,
    has_phone: Boolean(lead.phone),
    has_email: Boolean(lead.email),
    metadata: lead.metadata,
  };
}

tick();
setInterval(tick, config.intervalMs);

process.on('SIGINT', () => {
  console.log('\n🛑 Growth Agent Worker stopping...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Growth Agent Worker stopping...');
  process.exit(0);
});
