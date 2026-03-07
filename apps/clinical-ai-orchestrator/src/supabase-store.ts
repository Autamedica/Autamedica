import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Channel,
  ChannelBinding,
  ClinicalAiJobRecord,
  ClinicalAiMediaItemRecord,
  ClinicalAiSessionRecord,
  ClinicalAiTranscriptRecord,
  StateSnapshot,
} from './types.js';
import type {
  CreateJobInput,
  CreateMediaItemInput,
  CreateSessionInput,
  CreateTranscriptInput,
  PipelineStore,
} from './store.js';

type DbRecord = Record<string, unknown>;

function retentionIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function getString(row: DbRecord, key: string): string | undefined {
  return typeof row[key] === 'string' ? (row[key] as string) : undefined;
}

function getNumber(row: DbRecord, key: string): number | undefined {
  return typeof row[key] === 'number' ? (row[key] as number) : undefined;
}

function getBoolean(row: DbRecord, key: string): boolean | undefined {
  return typeof row[key] === 'boolean' ? (row[key] as boolean) : undefined;
}

function requireString(row: DbRecord, key: string): string {
  const value = getString(row, key);
  if (!value) {
    throw new Error(`Missing required column ${key}`);
  }

  return value;
}

function mapBinding(row: DbRecord): ChannelBinding {
  const senderWaId = getString(row, 'sender_wa_id');
  const displayName = getString(row, 'display_name');
  const verifiedAt = getString(row, 'verified_at');

  return {
    id: requireString(row, 'id'),
    doctorProfileId: requireString(row, 'doctor_profile_id'),
    channel: requireString(row, 'channel') as ChannelBinding['channel'],
    providerName: requireString(row, 'provider_name'),
    senderChannelId: requireString(row, 'sender_channel_id'),
    active: getBoolean(row, 'active') ?? true,
    ...(senderWaId ? { senderWaId } : {}),
    ...(displayName ? { displayName } : {}),
    ...(verifiedAt ? { verifiedAt } : {}),
  };
}

function mapSession(row: DbRecord): ClinicalAiSessionRecord {
  const patientProfileId = getString(row, 'patient_profile_id');
  const languageCode = getString(row, 'language_code');
  const specialtyHint = getString(row, 'specialty_hint');
  const sessionSealedAt = getString(row, 'session_sealed_at');
  const processingStartedAt = getString(row, 'processing_started_at');
  const deliveryCompletedAt = getString(row, 'delivery_completed_at');

  return {
    id: requireString(row, 'id'),
    doctorProfileId: requireString(row, 'doctor_profile_id'),
    channel: requireString(row, 'channel') as Channel,
    channelThreadRef: getString(row, 'channel_thread_ref') || '',
    providerName: requireString(row, 'provider_name'),
    status: requireString(row, 'status') as ClinicalAiSessionRecord['status'],
    sessionOpenedAt: requireString(row, 'session_opened_at'),
    retentionExpiresAt: requireString(row, 'retention_expires_at'),
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
    ...(patientProfileId ? { patientProfileId } : {}),
    ...(languageCode ? { languageCode } : {}),
    ...(specialtyHint ? { specialtyHint } : {}),
    ...(sessionSealedAt ? { sessionSealedAt } : {}),
    ...(processingStartedAt ? { processingStartedAt } : {}),
    ...(deliveryCompletedAt ? { deliveryCompletedAt } : {}),
  };
}

function mapMediaItem(row: DbRecord): ClinicalAiMediaItemRecord {
  const sizeBytes = getNumber(row, 'size_bytes');
  const durationSeconds = getNumber(row, 'duration_seconds');
  const sha256 = getString(row, 'sha256');
  const storageUriRaw = getString(row, 'storage_uri_raw');
  const storageUriNormalized = getString(row, 'storage_uri_normalized');
  const downloadedAt = getString(row, 'downloaded_at');
  const normalizedAt = getString(row, 'normalized_at');

  return {
    id: requireString(row, 'id'),
    sessionId: requireString(row, 'session_id'),
    providerMessageId: requireString(row, 'provider_message_id'),
    providerMediaIndex: getNumber(row, 'provider_media_index') ?? 0,
    providerMediaUrl: getString(row, 'provider_media_url') || '',
    contentType: requireString(row, 'content_type'),
    status: requireString(row, 'status') as ClinicalAiMediaItemRecord['status'],
    receivedAt: requireString(row, 'received_at'),
    retentionExpiresAt: requireString(row, 'retention_expires_at'),
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
    ...(sizeBytes !== undefined ? { sizeBytes } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(sha256 ? { sha256 } : {}),
    ...(storageUriRaw ? { storageUriRaw } : {}),
    ...(storageUriNormalized ? { storageUriNormalized } : {}),
    ...(downloadedAt ? { downloadedAt } : {}),
    ...(normalizedAt ? { normalizedAt } : {}),
  };
}

function mapJob(row: DbRecord): ClinicalAiJobRecord {
  const mediaItemId = getString(row, 'media_item_id');
  const providerOperationRef = getString(row, 'provider_operation_ref');
  const errorCode = getString(row, 'error_code');
  const errorMessageRedacted = getString(row, 'error_message_redacted');
  const startedAt = getString(row, 'started_at');
  const completedAt = getString(row, 'completed_at');

  return {
    id: requireString(row, 'id'),
    sessionId: requireString(row, 'session_id'),
    stage: requireString(row, 'stage') as ClinicalAiJobRecord['stage'],
    status: requireString(row, 'status') as ClinicalAiJobRecord['status'],
    attempt: getNumber(row, 'attempt') ?? 1,
    idempotencyKey: requireString(row, 'idempotency_key'),
    queueName: requireString(row, 'queue_name'),
    scheduledAt: requireString(row, 'scheduled_at'),
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
    ...(mediaItemId ? { mediaItemId } : {}),
    ...(providerOperationRef ? { providerOperationRef } : {}),
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessageRedacted ? { errorMessageRedacted } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(completedAt ? { completedAt } : {}),
  };
}

function mapMaybeSingle<T>(rows: unknown, mapper: (row: DbRecord) => T): T | undefined {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return undefined;
  }

  return mapper(rows[0] as DbRecord);
}

function mapTranscript(row: DbRecord): ClinicalAiTranscriptRecord {
  const mediaItemId = getString(row, 'media_item_id');
  const wordCount = getNumber(row, 'word_count');
  const durationSeconds = getNumber(row, 'duration_seconds');
  const confidenceSummary =
    row.confidence_summary && typeof row.confidence_summary === 'object'
      ? (row.confidence_summary as Record<string, unknown>)
      : {};

  return {
    id: requireString(row, 'id'),
    sessionId: requireString(row, 'session_id'),
    sttProvider: requireString(row, 'stt_provider'),
    languageCode: requireString(row, 'language_code'),
    diarizationEnabled: getBoolean(row, 'diarization_enabled') ?? false,
    multiChannelEnabled: getBoolean(row, 'multi_channel_enabled') ?? false,
    transcriptUri: requireString(row, 'transcript_uri'),
    transcriptSha256: requireString(row, 'transcript_sha256'),
    confidenceSummary,
    createdAt: requireString(row, 'created_at'),
    updatedAt: requireString(row, 'updated_at'),
    ...(mediaItemId ? { mediaItemId } : {}),
    ...(wordCount !== undefined ? { wordCount } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
  };
}

function mergeBindings(localBindings: ChannelBinding[], dbBindings: ChannelBinding[]): ChannelBinding[] {
  const merged = new Map<string, ChannelBinding>();

  for (const binding of [...dbBindings, ...localBindings]) {
    const key = `${binding.providerName}:${binding.channel}:${binding.senderChannelId}`;
    merged.set(key, binding);
  }

  return [...merged.values()];
}

export class SupabasePipelineStore implements PipelineStore {
  readonly kind = 'supabase' as const;
  private readonly client: SupabaseClient;
  private readonly localBindings: ChannelBinding[];
  private readonly inboundResults = new Map<string, unknown>();

  constructor(args: {
    supabaseUrl: string;
    supabaseServiceRoleKey: string;
    fallbackBindings: ChannelBinding[];
  }) {
    this.client = createClient(args.supabaseUrl, args.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    this.localBindings = args.fallbackBindings;
  }

  async resolveBinding(providerName: string, channel: Channel, senderChannelId: string): Promise<ChannelBinding | undefined> {
    const localBinding = this.localBindings.find(
      (binding) =>
        binding.active &&
        binding.providerName === providerName &&
        binding.channel === channel &&
        binding.senderChannelId === senderChannelId
    );
    if (localBinding) {
      return localBinding;
    }

    const { data, error } = await this.client
      .from('clinical_ai_channel_bindings')
      .select('*')
      .eq('provider_name', providerName)
      .eq('channel', channel)
      .eq('sender_channel_id', senderChannelId)
      .eq('active', true)
      .limit(1);

    if (error) {
      throw new Error(`Failed to resolve channel binding: ${error.message}`);
    }

    return mapMaybeSingle(data, mapBinding);
  }

  async getInboundResult<T>(idempotencyKey: string): Promise<T | undefined> {
    return this.inboundResults.get(idempotencyKey) as T | undefined;
  }

  async setInboundResult(idempotencyKey: string, result: unknown): Promise<void> {
    this.inboundResults.set(idempotencyKey, result);
  }

  async findOpenSession(
    doctorProfileId: string,
    channel: Channel,
    channelThreadRef: string
  ): Promise<ClinicalAiSessionRecord | undefined> {
    const { data, error } = await this.client
      .from('clinical_ai_sessions')
      .select('*')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('channel', channel)
      .eq('channel_thread_ref', channelThreadRef)
      .in('status', ['OPEN', 'WAITING_FOR_MORE_AUDIO'])
      .order('session_opened_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch open session: ${error.message}`);
    }

    return mapMaybeSingle(data, mapSession);
  }

  async findMostRecentSession(
    doctorProfileId: string,
    channel: Channel,
    channelThreadRef: string
  ): Promise<ClinicalAiSessionRecord | undefined> {
    const { data, error } = await this.client
      .from('clinical_ai_sessions')
      .select('*')
      .eq('doctor_profile_id', doctorProfileId)
      .eq('channel', channel)
      .eq('channel_thread_ref', channelThreadRef)
      .order('session_opened_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch latest session: ${error.message}`);
    }

    return mapMaybeSingle(data, mapSession);
  }

  async getSession(sessionId: string): Promise<ClinicalAiSessionRecord | undefined> {
    const { data, error } = await this.client.from('clinical_ai_sessions').select('*').eq('id', sessionId).limit(1);
    if (error) {
      throw new Error(`Failed to fetch session ${sessionId}: ${error.message}`);
    }

    return mapMaybeSingle(data, mapSession);
  }

  async createSession(input: CreateSessionInput): Promise<ClinicalAiSessionRecord> {
    const { data, error } = await this.client
      .from('clinical_ai_sessions')
      .insert({
        doctor_profile_id: input.doctorProfileId,
        channel: input.channel,
        channel_thread_ref: input.channelThreadRef,
        provider_name: input.providerName,
        status: 'OPEN',
        retention_expires_at: retentionIso(7),
      })
      .select('*')
      .limit(1);

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }

    const session = mapMaybeSingle(data, mapSession);
    if (!session) {
      throw new Error('Session creation returned no rows');
    }

    return session;
  }

  async updateSession(sessionId: string, patch: Partial<ClinicalAiSessionRecord>): Promise<ClinicalAiSessionRecord> {
    const update: DbRecord = {};

    if (patch.patientProfileId !== undefined) update.patient_profile_id = patch.patientProfileId;
    if (patch.channel !== undefined) update.channel = patch.channel;
    if (patch.channelThreadRef !== undefined) update.channel_thread_ref = patch.channelThreadRef;
    if (patch.providerName !== undefined) update.provider_name = patch.providerName;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.languageCode !== undefined) update.language_code = patch.languageCode;
    if (patch.specialtyHint !== undefined) update.specialty_hint = patch.specialtyHint;
    if (patch.sessionOpenedAt !== undefined) update.session_opened_at = patch.sessionOpenedAt;
    if (patch.sessionSealedAt !== undefined) update.session_sealed_at = patch.sessionSealedAt;
    if (patch.processingStartedAt !== undefined) update.processing_started_at = patch.processingStartedAt;
    if (patch.deliveryCompletedAt !== undefined) update.delivery_completed_at = patch.deliveryCompletedAt;
    if (patch.retentionExpiresAt !== undefined) update.retention_expires_at = patch.retentionExpiresAt;

    const { data, error } = await this.client
      .from('clinical_ai_sessions')
      .update(update)
      .eq('id', sessionId)
      .select('*')
      .limit(1);

    if (error) {
      throw new Error(`Failed to update session ${sessionId}: ${error.message}`);
    }

    const session = mapMaybeSingle(data, mapSession);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return session;
  }

  async createMediaItem(input: CreateMediaItemInput): Promise<ClinicalAiMediaItemRecord> {
    const { data, error } = await this.client
      .from('clinical_ai_media_items')
      .upsert(
        {
          session_id: input.sessionId,
          provider_message_id: input.providerMessageId,
          provider_media_index: input.providerMediaIndex,
          provider_media_url: input.providerMediaUrl,
          content_type: input.contentType,
          status: 'RECEIVED',
          retention_expires_at: retentionIso(7),
        },
        {
          onConflict: 'provider_message_id,provider_media_index',
          ignoreDuplicates: false,
        }
      )
      .select('*')
      .limit(1);

    if (error) {
      throw new Error(`Failed to create media item: ${error.message}`);
    }

    const mediaItem = mapMaybeSingle(data, mapMediaItem);
    if (!mediaItem) {
      throw new Error('Media item creation returned no rows');
    }

    return mediaItem;
  }

  async getMediaItem(mediaItemId: string): Promise<ClinicalAiMediaItemRecord | undefined> {
    const { data, error } = await this.client
      .from('clinical_ai_media_items')
      .select('*')
      .eq('id', mediaItemId)
      .limit(1);

    if (error) {
      throw new Error(`Failed to fetch media item ${mediaItemId}: ${error.message}`);
    }

    return mapMaybeSingle(data, mapMediaItem);
  }

  async updateMediaItem(
    mediaItemId: string,
    patch: Partial<ClinicalAiMediaItemRecord>
  ): Promise<ClinicalAiMediaItemRecord> {
    const update: DbRecord = {};

    if (patch.providerMediaUrl !== undefined) update.provider_media_url = patch.providerMediaUrl;
    if (patch.contentType !== undefined) update.content_type = patch.contentType;
    if (patch.sizeBytes !== undefined) update.size_bytes = patch.sizeBytes;
    if (patch.durationSeconds !== undefined) update.duration_seconds = patch.durationSeconds;
    if (patch.sha256 !== undefined) update.sha256 = patch.sha256;
    if (patch.storageUriRaw !== undefined) update.storage_uri_raw = patch.storageUriRaw;
    if (patch.storageUriNormalized !== undefined) update.storage_uri_normalized = patch.storageUriNormalized;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.receivedAt !== undefined) update.received_at = patch.receivedAt;
    if (patch.downloadedAt !== undefined) update.downloaded_at = patch.downloadedAt;
    if (patch.normalizedAt !== undefined) update.normalized_at = patch.normalizedAt;
    if (patch.retentionExpiresAt !== undefined) update.retention_expires_at = patch.retentionExpiresAt;

    const { data, error } = await this.client
      .from('clinical_ai_media_items')
      .update(update)
      .eq('id', mediaItemId)
      .select('*')
      .limit(1);

    if (error) {
      throw new Error(`Failed to update media item ${mediaItemId}: ${error.message}`);
    }

    const mediaItem = mapMaybeSingle(data, mapMediaItem);
    if (!mediaItem) {
      throw new Error(`Media item ${mediaItemId} not found`);
    }

    return mediaItem;
  }

  async listMediaItemsBySession(sessionId: string): Promise<ClinicalAiMediaItemRecord[]> {
    const { data, error } = await this.client
      .from('clinical_ai_media_items')
      .select('*')
      .eq('session_id', sessionId)
      .order('received_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to list media items for session ${sessionId}: ${error.message}`);
    }

    return (data || []).map((row) => mapMediaItem(row as DbRecord));
  }

  async getJob(jobId: string): Promise<ClinicalAiJobRecord | undefined> {
    const { data, error } = await this.client.from('clinical_ai_jobs').select('*').eq('id', jobId).limit(1);
    if (error) {
      throw new Error(`Failed to fetch job ${jobId}: ${error.message}`);
    }

    return mapMaybeSingle(data, mapJob);
  }

  async createJob(input: CreateJobInput): Promise<ClinicalAiJobRecord> {
    const { data: existingRows, error: existingError } = await this.client
      .from('clinical_ai_jobs')
      .select('*')
      .eq('idempotency_key', input.idempotencyKey)
      .limit(1);

    if (existingError) {
      throw new Error(`Failed to check existing job: ${existingError.message}`);
    }

    const existing = mapMaybeSingle(existingRows, mapJob);
    if (existing) {
      return existing;
    }

    const { data, error } = await this.client
      .from('clinical_ai_jobs')
      .insert({
        ...(input.id ? { id: input.id } : {}),
        session_id: input.sessionId,
        ...(input.mediaItemId ? { media_item_id: input.mediaItemId } : {}),
        stage: input.stage,
        status: 'PENDING',
        attempt: 1,
        idempotency_key: input.idempotencyKey,
        queue_name: input.queueName,
      })
      .select('*')
      .limit(1);

    if (error) {
      throw new Error(`Failed to create job: ${error.message}`);
    }

    const job = mapMaybeSingle(data, mapJob);
    if (!job) {
      throw new Error('Job creation returned no rows');
    }

    return job;
  }

  async updateJob(jobId: string, patch: Partial<ClinicalAiJobRecord>): Promise<ClinicalAiJobRecord> {
    const update: DbRecord = {};

    if (patch.mediaItemId !== undefined) update.media_item_id = patch.mediaItemId;
    if (patch.stage !== undefined) update.stage = patch.stage;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.attempt !== undefined) update.attempt = patch.attempt;
    if (patch.idempotencyKey !== undefined) update.idempotency_key = patch.idempotencyKey;
    if (patch.queueName !== undefined) update.queue_name = patch.queueName;
    if (patch.providerOperationRef !== undefined) update.provider_operation_ref = patch.providerOperationRef;
    if (patch.errorCode !== undefined) update.error_code = patch.errorCode;
    if (patch.errorMessageRedacted !== undefined) update.error_message_redacted = patch.errorMessageRedacted;
    if (patch.scheduledAt !== undefined) update.scheduled_at = patch.scheduledAt;
    if (patch.startedAt !== undefined) update.started_at = patch.startedAt;
    if (patch.completedAt !== undefined) update.completed_at = patch.completedAt;

    const { data, error } = await this.client
      .from('clinical_ai_jobs')
      .update(update)
      .eq('id', jobId)
      .select('*')
      .limit(1);

    if (error) {
      throw new Error(`Failed to update job ${jobId}: ${error.message}`);
    }

    const job = mapMaybeSingle(data, mapJob);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    return job;
  }

  async createTranscript(input: CreateTranscriptInput): Promise<ClinicalAiTranscriptRecord> {
    const { data, error } = await this.client
      .from('clinical_ai_transcripts')
      .insert({
        session_id: input.sessionId,
        ...(input.mediaItemId ? { media_item_id: input.mediaItemId } : {}),
        stt_provider: input.sttProvider,
        language_code: input.languageCode,
        diarization_enabled: input.diarizationEnabled,
        multi_channel_enabled: input.multiChannelEnabled,
        transcript_uri: input.transcriptUri,
        transcript_sha256: input.transcriptSha256,
        confidence_summary: input.confidenceSummary,
        ...(input.wordCount !== undefined ? { word_count: input.wordCount } : {}),
        ...(input.durationSeconds !== undefined ? { duration_seconds: input.durationSeconds } : {}),
      })
      .select('*')
      .limit(1);

    if (error) {
      throw new Error(`Failed to create transcript: ${error.message}`);
    }

    const transcript = mapMaybeSingle(data, mapTranscript);
    if (!transcript) {
      throw new Error('Transcript creation returned no rows');
    }

    return transcript;
  }

  async listTranscriptsBySession(sessionId: string): Promise<ClinicalAiTranscriptRecord[]> {
    const { data, error } = await this.client
      .from('clinical_ai_transcripts')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to list transcripts for session ${sessionId}: ${error.message}`);
    }

    return (data || []).map((row) => mapTranscript(row as DbRecord));
  }

  async snapshot(): Promise<StateSnapshot> {
    const [bindingResult, sessionResult, mediaResult, jobResult, transcriptResult] = await Promise.all([
      this.client.from('clinical_ai_channel_bindings').select('*'),
      this.client.from('clinical_ai_sessions').select('*'),
      this.client.from('clinical_ai_media_items').select('*'),
      this.client.from('clinical_ai_jobs').select('*'),
      this.client.from('clinical_ai_transcripts').select('*'),
    ]);

    if (bindingResult.error) {
      throw new Error(`Failed to fetch bindings snapshot: ${bindingResult.error.message}`);
    }
    if (sessionResult.error) {
      throw new Error(`Failed to fetch sessions snapshot: ${sessionResult.error.message}`);
    }
    if (mediaResult.error) {
      throw new Error(`Failed to fetch media snapshot: ${mediaResult.error.message}`);
    }
    if (jobResult.error) {
      throw new Error(`Failed to fetch jobs snapshot: ${jobResult.error.message}`);
    }
    if (transcriptResult.error) {
      throw new Error(`Failed to fetch transcripts snapshot: ${transcriptResult.error.message}`);
    }

    return {
      storeKind: this.kind,
      bindings: mergeBindings(
        this.localBindings,
        (bindingResult.data || []).map((row) => mapBinding(row as DbRecord))
      ),
      sessions: (sessionResult.data || []).map((row) => mapSession(row as DbRecord)),
      mediaItems: (mediaResult.data || []).map((row) => mapMediaItem(row as DbRecord)),
      jobs: (jobResult.data || []).map((row) => mapJob(row as DbRecord)),
      transcripts: (transcriptResult.data || []).map((row) => mapTranscript(row as DbRecord)),
      inboundIdempotencyKeys: [...this.inboundResults.keys()],
    };
  }
}
