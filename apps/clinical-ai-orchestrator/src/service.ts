import { createHash } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { logger } from './logger.js';
import { LocalArtifactStorage } from './artifact-storage.js';
import { probeAudio, normalizeAudio } from './audio.js';
import { InMemoryPipelineStore, type PipelineStore } from './store.js';
import { SpeechToTextService } from './stt.js';
import { SupabasePipelineStore } from './supabase-store.js';
import { buildCanonicalInboundEnvelope, extractCommand, hasAudioMedia, parseTwilioForm, validateTwilioSignature } from './twilio.js';
import type {
  ClinicalAiJobRecord,
  ClinicalAiMediaItemRecord,
  ClinicalAiSessionRecord,
  InternalJobExecutionResult,
  InternalStageSlug,
  JobStage,
  StagePayloadMap,
  SupportedCommand,
  WebhookResult,
} from './types.js';

const STAGE_TO_QUEUE: Record<JobStage, string> = {
  MEDIA_FETCH: 'q-media-fetch',
  AUDIO_PREP: 'q-audio-prep',
  STT_SUBMIT: 'q-stt-submit',
  STT_FINALIZE: 'q-stt-finalize',
  NORMALIZE: 'q-normalize',
  REASON: 'q-reason',
  VALIDATE: 'q-validate',
  DELIVER: 'q-deliver',
  CLEANUP: 'q-cleanup',
};

const INTERNAL_STAGE_TO_JOB_STAGE: Record<InternalStageSlug, JobStage> = {
  'media-fetch': 'MEDIA_FETCH',
  'audio-prep': 'AUDIO_PREP',
  'stt-submit': 'STT_SUBMIT',
  'stt-finalize': 'STT_FINALIZE',
  normalize: 'NORMALIZE',
  reason: 'REASON',
  validate: 'VALIDATE',
  deliver: 'DELIVER',
  cleanup: 'CLEANUP',
};

class InvalidInternalPayloadError extends Error {}

class PipelineExecutionError extends Error {}

function buildInboundIdempotencyKey(providerMessageId: string): string {
  return `inbound:twilio:${providerMessageId}`;
}

function buildStageIdempotencyKey(sessionId: string, stage: JobStage, mediaItemId?: string): string {
  if (mediaItemId) {
    return `session:${sessionId}:media:${mediaItemId}:${stage}:v1`;
  }

  return `session:${sessionId}:${stage}:v1`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function resolveSessionLanguageCode(
  session: ClinicalAiSessionRecord | undefined,
  fallback: string | undefined
): string {
  return fallback || session?.languageCode || 'es-AR';
}

const MediaFetchPayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  media_item_id: z.string(),
  provider: z.string(),
  provider_message_id: z.string(),
  provider_media_index: z.number(),
});

const AudioPrepPayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  media_item_id: z.string(),
  storage_uri_raw: z.string(),
});

const SttSubmitPayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  doctor_profile_id: z.string(),
  language_code: z.string(),
  media_items: z.array(z.object({
    media_item_id: z.string(),
    storage_uri_normalized: z.string(),
  })).nonempty(),
  stt_config: z.object({
    provider: z.string(),
    diarization_enabled: z.boolean(),
    multi_channel_enabled: z.boolean(),
    phrase_set_key: z.string(),
  }),
});

const SttFinalizePayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  provider: z.string(),
  provider_operation_ref: z.string(),
  language_code: z.string().optional(),
  diarization_enabled: z.boolean().optional(),
  multi_channel_enabled: z.boolean().optional(),
});

const NormalizePayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  transcript_id: z.string(),
  normalizer_version: z.string(),
});

const ReasonPayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  normalized_transcript_id: z.string(),
  context_snapshot_id: z.string(),
  prompt_version: z.string(),
  schema_name: z.string(),
  model_name: z.string(),
  model_version: z.string(),
});

const ValidatePayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  output_id: z.string(),
  validator_version: z.string(),
});

const DeliverPayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  output_id: z.string(),
  channel: z.string(),
  provider: z.string(),
});

const CleanupPayloadSchema = z.object({
  schema_version: z.string(),
  job_id: z.string(),
  session_id: z.string(),
  reason: z.string(),
});

export class ClinicalAiPipelineService {
  constructor(
    private readonly config: AppConfig,
    private readonly store: PipelineStore,
    private readonly artifactStorage: LocalArtifactStorage,
    private readonly speechToText: SpeechToTextService
  ) {}

  async getStateSnapshot() {
    return this.store.snapshot();
  }

  async handleTwilioWebhook(args: {
    requestUrl: string;
    signature: string;
    rawBody: Record<string, unknown>;
  }): Promise<WebhookResult> {
    const form = parseTwilioForm(args.rawBody);

    if (!this.config.skipTwilioSignatureValidation) {
      if (!this.config.twilioAuthToken) {
        return {
          httpStatus: 500,
          body: {
            accepted: false,
            reason: 'server_misconfigured',
            message: 'TWILIO_AUTH_TOKEN is required when signature validation is enabled.',
          },
        };
      }

      if (!validateTwilioSignature(this.config.twilioAuthToken, args.requestUrl, args.signature, form)) {
        return {
          httpStatus: 403,
          body: {
            accepted: false,
            reason: 'invalid_signature',
            message: 'Twilio signature validation failed.',
          },
        };
      }
    }

    try {
      const envelope = buildCanonicalInboundEnvelope(form, new Date());
      const inboundIdempotencyKey = buildInboundIdempotencyKey(envelope.providerMessageId);
      const previousResult = await this.store.getInboundResult<WebhookResult['body']>(inboundIdempotencyKey);
      if (previousResult) {
        return {
          httpStatus: 200,
          body: {
            ...previousResult,
            duplicate: true,
          },
        };
      }

      const binding = await this.store.resolveBinding(envelope.provider, envelope.channel, envelope.senderChannelId);
      if (!binding) {
        const response: WebhookResult['body'] = {
          accepted: false,
          reason: 'unknown_sender',
          message: 'Numero no habilitado para uso clinico.',
        };
        await this.store.setInboundResult(inboundIdempotencyKey, response);
        return { httpStatus: 200, body: response };
      }

      const command = extractCommand(envelope.messageText);
      if (command) {
        const response = await this.handleCommand(binding.doctorProfileId, envelope.channel, envelope.senderChannelId, command);
        await this.store.setInboundResult(inboundIdempotencyKey, response.body);
        return response;
      }

      if (!hasAudioMedia(form)) {
        const response: WebhookResult['body'] = {
          accepted: false,
          reason: 'unsupported_message',
          message: 'Envie un audio o use /finalizar, /cancelar o /estado.',
        };
        await this.store.setInboundResult(inboundIdempotencyKey, response);
        return { httpStatus: 200, body: response };
      }

      const session =
        (await this.store.findOpenSession(binding.doctorProfileId, envelope.channel, envelope.senderChannelId)) ??
        (await this.store.createSession({
          doctorProfileId: binding.doctorProfileId,
          channel: envelope.channel,
          channelThreadRef: envelope.senderChannelId,
          providerName: envelope.provider,
        }));

      const activeSession =
        session.status === 'OPEN'
          ? await this.store.updateSession(session.id, { status: 'WAITING_FOR_MORE_AUDIO' })
          : session;

      const jobIds: string[] = [];
      for (const mediaItem of envelope.mediaItems) {
        const createdMediaItem = await this.store.createMediaItem({
          sessionId: activeSession.id,
          providerMessageId: envelope.providerMessageId,
          providerMediaIndex: mediaItem.providerMediaIndex,
          providerMediaUrl: mediaItem.providerMediaUrl,
          contentType: mediaItem.contentType,
        });

        const mediaFetchJob = await this.store.createJob({
          sessionId: activeSession.id,
          mediaItemId: createdMediaItem.id,
          stage: 'MEDIA_FETCH',
          queueName: STAGE_TO_QUEUE.MEDIA_FETCH,
          idempotencyKey: buildStageIdempotencyKey(activeSession.id, 'MEDIA_FETCH', createdMediaItem.id),
        });

        jobIds.push(mediaFetchJob.id);
      }

      const response: WebhookResult['body'] = {
        accepted: true,
        sessionId: activeSession.id,
        message: 'Audio recibido. Escriba /finalizar cuando termine.',
        jobIds,
      };

      await this.store.setInboundResult(inboundIdempotencyKey, response);
      logger.info('Webhook audio accepted', {
        sessionId: activeSession.id,
        providerMessageId: envelope.providerMessageId,
        mediaCount: envelope.mediaItems.length,
        store: this.store.kind,
      });

      return {
        httpStatus: 200,
        body: response,
      };
    } catch (error) {
      logger.warn('Rejected malformed Twilio payload', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });

      return {
        httpStatus: 400,
        body: {
          accepted: false,
          reason: 'malformed_payload',
          message: error instanceof Error ? error.message : 'Invalid inbound payload.',
        },
      };
    }
  }

  async acceptInternalJob<Stage extends InternalStageSlug>(
    stageSlug: Stage,
    payload: unknown
  ): Promise<InternalJobExecutionResult> {
    const parsedPayload = this.validateInternalPayload(stageSlug, payload);
    const jobStage = INTERNAL_STAGE_TO_JOB_STAGE[stageSlug];
    const queueName = STAGE_TO_QUEUE[jobStage];
    const existing = await this.store.getJob(parsedPayload.job_id);

    const mediaItemId =
      'media_item_id' in parsedPayload && typeof parsedPayload.media_item_id === 'string'
        ? parsedPayload.media_item_id
        : undefined;

    const job =
      existing ??
      (await this.store.createJob({
        id: parsedPayload.job_id,
        sessionId: parsedPayload.session_id,
        stage: jobStage,
        queueName,
        idempotencyKey: `internal:${stageSlug}:${parsedPayload.job_id}`,
        ...(mediaItemId ? { mediaItemId } : {}),
      }));

    if (job.status === 'SUCCEEDED') {
      const mediaItem = mediaItemId ? await this.store.getMediaItem(mediaItemId) : undefined;
      return {
        accepted: true,
        duplicate: true,
        stage: job.stage,
        queueName: job.queueName,
        jobId: job.id,
        sessionId: job.sessionId,
        jobStatus: job.status,
        ...(job.providerOperationRef ? { providerOperationRef: job.providerOperationRef } : {}),
        ...(mediaItem?.status ? { mediaItemStatus: mediaItem.status } : {}),
      };
    }

    switch (stageSlug) {
      case 'media-fetch':
        return this.runMediaFetchJob(job, parsedPayload as StagePayloadMap['media-fetch']);
      case 'audio-prep':
        return this.runAudioPrepJob(job, parsedPayload as StagePayloadMap['audio-prep']);
      case 'stt-submit':
        return this.runSttSubmitJob(job, parsedPayload as StagePayloadMap['stt-submit']);
      case 'stt-finalize':
        return this.runSttFinalizeJob(job, parsedPayload as StagePayloadMap['stt-finalize']);
      case 'reason':
        return this.runReasonJob(job, parsedPayload as StagePayloadMap['reason']);
      default:
        return {
          accepted: true,
          duplicate: false,
          stage: job.stage,
          queueName: job.queueName,
          jobId: job.id,
          sessionId: job.sessionId,
          jobStatus: job.status,
          message: 'Stage accepted. Executor not implemented yet.',
        };
    }
  }

  private async runMediaFetchJob(
    job: ClinicalAiJobRecord,
    payload: StagePayloadMap['media-fetch']
  ): Promise<InternalJobExecutionResult> {
    const mediaItem = await this.requireMediaItem(payload.media_item_id);

    await this.store.updateJob(job.id, {
      status: 'RUNNING',
      startedAt: nowIso(),
    });

    try {
      await this.artifactStorage.ensureReady();
      const bytes = await this.fetchProviderMedia(mediaItem.providerMediaUrl, payload.provider);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      const rawArtifact = await this.artifactStorage.writeRawMedia({
        mediaItemId: mediaItem.id,
        contentType: mediaItem.contentType,
        bytes,
      });
      const updatedMediaItem = await this.store.updateMediaItem(mediaItem.id, {
        status: 'FETCHED',
        sizeBytes: bytes.byteLength,
        sha256,
        storageUriRaw: rawArtifact.storageUri,
        downloadedAt: nowIso(),
      });
      const nextJob = await this.store.createJob({
        sessionId: job.sessionId,
        mediaItemId: mediaItem.id,
        stage: 'AUDIO_PREP',
        queueName: STAGE_TO_QUEUE.AUDIO_PREP,
        idempotencyKey: buildStageIdempotencyKey(job.sessionId, 'AUDIO_PREP', mediaItem.id),
      });
      const completedJob = await this.store.updateJob(job.id, {
        status: 'SUCCEEDED',
        completedAt: nowIso(),
      });

      return {
        accepted: true,
        duplicate: false,
        stage: completedJob.stage,
        queueName: completedJob.queueName,
        jobId: completedJob.id,
        sessionId: completedJob.sessionId,
        jobStatus: completedJob.status,
        mediaItemStatus: updatedMediaItem.status,
        message: 'Raw media fetched and stored.',
        nextJobIds: [nextJob.id],
        artifacts: {
          ...(updatedMediaItem.sizeBytes !== undefined ? { sizeBytes: updatedMediaItem.sizeBytes } : {}),
          ...(updatedMediaItem.sha256 ? { sha256: updatedMediaItem.sha256 } : {}),
          ...(updatedMediaItem.storageUriRaw ? { storageUriRaw: updatedMediaItem.storageUriRaw } : {}),
        },
      };
    } catch (error) {
      await this.failJob(job, mediaItem, 'MEDIA_FETCH_FAILED', error);
      throw new PipelineExecutionError(error instanceof Error ? error.message : 'Media fetch failed');
    }
  }

  private async runAudioPrepJob(
    job: ClinicalAiJobRecord,
    payload: StagePayloadMap['audio-prep']
  ): Promise<InternalJobExecutionResult> {
    const mediaItem = await this.requireMediaItem(payload.media_item_id);
    const rawStorageUri = mediaItem.storageUriRaw || payload.storage_uri_raw;

    if (!rawStorageUri) {
      await this.failJob(job, mediaItem, 'RAW_MEDIA_MISSING', new Error('Missing raw media storage URI'));
      throw new PipelineExecutionError('Missing raw media storage URI');
    }

    await this.store.updateJob(job.id, {
      status: 'RUNNING',
      startedAt: nowIso(),
    });

    try {
      await this.artifactStorage.ensureReady();
      const inputPath = this.artifactStorage.resolvePath(rawStorageUri);
      const normalizedTarget = await this.artifactStorage.prepareNormalizedTarget(mediaItem.id);

      await normalizeAudio({
        inputPath,
        outputPath: normalizedTarget.filePath,
        ffmpegBinary: this.config.ffmpegBinary,
      });

      const probe = await probeAudio(normalizedTarget.filePath, this.config.ffprobeBinary);
      const updatedMediaItem = await this.store.updateMediaItem(mediaItem.id, {
        status: 'NORMALIZED',
        storageUriNormalized: normalizedTarget.storageUri,
        normalizedAt: nowIso(),
        ...(probe.durationSeconds !== undefined ? { durationSeconds: probe.durationSeconds } : {}),
      });
      const completedJob = await this.store.updateJob(job.id, {
        status: 'SUCCEEDED',
        completedAt: nowIso(),
      });

      return {
        accepted: true,
        duplicate: false,
        stage: completedJob.stage,
        queueName: completedJob.queueName,
        jobId: completedJob.id,
        sessionId: completedJob.sessionId,
        jobStatus: completedJob.status,
        mediaItemStatus: updatedMediaItem.status,
        message: 'Audio normalized to 16kHz mono WAV.',
        artifacts: {
          ...(updatedMediaItem.durationSeconds !== undefined ? { durationSeconds: updatedMediaItem.durationSeconds } : {}),
          ...(updatedMediaItem.storageUriRaw ? { storageUriRaw: updatedMediaItem.storageUriRaw } : {}),
          ...(updatedMediaItem.storageUriNormalized
            ? { storageUriNormalized: updatedMediaItem.storageUriNormalized }
            : {}),
        },
      };
    } catch (error) {
      await this.failJob(job, mediaItem, 'AUDIO_PREP_FAILED', error);
      throw new PipelineExecutionError(error instanceof Error ? error.message : 'Audio prep failed');
    }
  }

  private async runSttSubmitJob(
    job: ClinicalAiJobRecord,
    payload: StagePayloadMap['stt-submit']
  ): Promise<InternalJobExecutionResult> {
    const session = await this.store.getSession(job.sessionId);

    await this.store.updateJob(job.id, {
      status: 'RUNNING',
      startedAt: nowIso(),
    });

    try {
      const submitResult = await this.speechToText.submit({
        sessionId: job.sessionId,
        provider: payload.stt_config.provider || this.config.sttProviderDefault,
        languageCode: payload.language_code,
        mediaItems: payload.media_items.map((item) => ({
          mediaItemId: item.media_item_id,
          storageUriNormalized: item.storage_uri_normalized,
        })),
        diarizationEnabled: payload.stt_config.diarization_enabled,
        multiChannelEnabled: payload.stt_config.multi_channel_enabled,
      });
      await this.store.updateSession(job.sessionId, {
        status: 'PROCESSING',
        languageCode: payload.language_code,
        processingStartedAt: session?.processingStartedAt || nowIso(),
      });
      const completedJob = await this.store.updateJob(job.id, {
        status: 'SUCCEEDED',
        providerOperationRef: submitResult.providerOperationRef,
        completedAt: nowIso(),
      });
      const nextJob = await this.store.createJob({
        sessionId: job.sessionId,
        stage: 'STT_FINALIZE',
        queueName: STAGE_TO_QUEUE.STT_FINALIZE,
        idempotencyKey: buildStageIdempotencyKey(job.sessionId, 'STT_FINALIZE'),
      });

      return {
        accepted: true,
        duplicate: false,
        stage: completedJob.stage,
        queueName: completedJob.queueName,
        jobId: completedJob.id,
        sessionId: completedJob.sessionId,
        jobStatus: completedJob.status,
        providerOperationRef: submitResult.providerOperationRef,
        nextJobIds: [nextJob.id],
        message: 'Speech-to-Text submitted.',
        artifacts: {
          ...(submitResult.durationSeconds !== undefined ? { durationSeconds: submitResult.durationSeconds } : {}),
          combinedStorageUri: submitResult.combinedStorageUri,
          ...(submitResult.submittedAudioUri ? { submittedAudioUri: submitResult.submittedAudioUri } : {}),
        },
      };
    } catch (error) {
      await this.failJob(job, undefined, 'STT_SUBMIT_FAILED', error);
      throw new PipelineExecutionError(error instanceof Error ? error.message : 'STT submit failed');
    }
  }

  private async runSttFinalizeJob(
    job: ClinicalAiJobRecord,
    payload: StagePayloadMap['stt-finalize']
  ): Promise<InternalJobExecutionResult> {
    const session = await this.store.getSession(job.sessionId);
    const mediaItems = (await this.store.listMediaItemsBySession(job.sessionId))
      .filter((item) => item.storageUriNormalized)
      .map((item) => ({
        mediaItemId: item.id,
        storageUriNormalized: item.storageUriNormalized ?? '',
        ...(item.durationSeconds !== undefined ? { durationSeconds: item.durationSeconds } : {}),
      }));

    if (mediaItems.length === 0) {
      await this.failJob(job, undefined, 'NORMALIZED_MEDIA_MISSING', new Error('No normalized media available for STT finalize'));
      throw new PipelineExecutionError('No normalized media available for STT finalize');
    }

    const languageCode = resolveSessionLanguageCode(session, payload.language_code);

    await this.store.updateJob(job.id, {
      status: 'RUNNING',
      startedAt: nowIso(),
    });

    try {
      const finalizeResult = await this.speechToText.finalize({
        sessionId: job.sessionId,
        provider: payload.provider,
        providerOperationRef: payload.provider_operation_ref,
        languageCode,
        mediaItems,
        diarizationEnabled: payload.diarization_enabled ?? false,
        multiChannelEnabled: payload.multi_channel_enabled ?? false,
      });
      const transcriptArtifact = await this.artifactStorage.writeTranscriptArtifact({
        sessionId: job.sessionId,
        fileName: `transcript-${job.id}.json`,
        payload: finalizeResult.transcriptPayload,
      });
      const transcript = await this.store.createTranscript({
        sessionId: job.sessionId,
        sttProvider: payload.provider,
        languageCode,
        diarizationEnabled: payload.diarization_enabled ?? false,
        multiChannelEnabled: payload.multi_channel_enabled ?? false,
        transcriptUri: transcriptArtifact.storageUri,
        transcriptSha256: finalizeResult.transcriptSha256,
        confidenceSummary: finalizeResult.confidenceSummary,
        wordCount: finalizeResult.wordCount,
        ...(finalizeResult.durationSeconds !== undefined ? { durationSeconds: finalizeResult.durationSeconds } : {}),
      });
      const completedJob = await this.store.updateJob(job.id, {
        status: 'SUCCEEDED',
        completedAt: nowIso(),
      });
      const nextJob = await this.store.createJob({
        sessionId: job.sessionId,
        stage: 'NORMALIZE',
        queueName: STAGE_TO_QUEUE.NORMALIZE,
        idempotencyKey: buildStageIdempotencyKey(job.sessionId, 'NORMALIZE'),
      });

      return {
        accepted: true,
        duplicate: false,
        stage: completedJob.stage,
        queueName: completedJob.queueName,
        jobId: completedJob.id,
        sessionId: completedJob.sessionId,
        jobStatus: completedJob.status,
        transcriptId: transcript.id,
        nextJobIds: [nextJob.id],
        message: 'Speech-to-Text finalized and transcript stored.',
        artifacts: {
          transcriptUri: transcript.transcriptUri,
          sha256: transcript.transcriptSha256,
          ...(transcript.durationSeconds !== undefined ? { durationSeconds: transcript.durationSeconds } : {}),
        },
      };
    } catch (error) {
      await this.failJob(job, undefined, 'STT_FINALIZE_FAILED', error);
      throw new PipelineExecutionError(error instanceof Error ? error.message : 'STT finalize failed');
    }
  }

  private async runReasonJob(
    job: ClinicalAiJobRecord,
    payload: StagePayloadMap['reason']
  ): Promise<InternalJobExecutionResult> {
    await this.store.updateJob(job.id, {
      status: 'RUNNING',
      startedAt: nowIso(),
    });

    try {
      // Mock logic: In a real system, this calls the LLM with the transcript
      const transcripts = await this.store.listTranscriptsBySession(job.sessionId);
      const transcript = transcripts.find(t => t.id === payload.normalized_transcript_id);
      
      if (!transcript) {
        throw new Error('Transcript not found');
      }

      // Store in a hypothetical "output" store
      // For now, update job status to SUCCEEDED
      const completedJob = await this.store.updateJob(job.id, {
        status: 'SUCCEEDED',
        completedAt: nowIso(),
      });

      return {
        accepted: true,
        duplicate: false,
        stage: completedJob.stage,
        queueName: completedJob.queueName,
        jobId: completedJob.id,
        sessionId: completedJob.sessionId,
        jobStatus: completedJob.status,
        message: 'Anamnesis extraction completed.',
      };
    } catch (error) {
      await this.failJob(job, undefined, 'REASON_FAILED', error);
      throw new PipelineExecutionError(error instanceof Error ? error.message : 'Reasoning failed');
    }
  }

  private async failJob(
    job: ClinicalAiJobRecord,
    mediaItem: ClinicalAiMediaItemRecord | undefined,
    errorCode: string,
    error: unknown
  ): Promise<void> {
    if (mediaItem) {
      await this.store.updateMediaItem(mediaItem.id, { status: 'FAILED' });
    }

    await this.store.updateJob(job.id, {
      status: 'FAILED_RETRYABLE',
      errorCode,
      errorMessageRedacted: error instanceof Error ? error.message : 'Unexpected error',
      completedAt: nowIso(),
    });
  }

  private async requireMediaItem(mediaItemId: string): Promise<ClinicalAiMediaItemRecord> {
    const mediaItem = await this.store.getMediaItem(mediaItemId);
    if (!mediaItem) {
      throw new PipelineExecutionError(`Media item ${mediaItemId} not found`);
    }

    return mediaItem;
  }

  private async fetchProviderMedia(providerMediaUrl: string, provider: string): Promise<Buffer> {
    const headers = new Headers();

    if (provider === 'twilio' && this.config.twilioAccountSid && this.config.twilioAuthToken) {
      const credentials = Buffer.from(`${this.config.twilioAccountSid}:${this.config.twilioAuthToken}`).toString('base64');
      headers.set('authorization', `Basic ${credentials}`);
    }

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.config.mediaFetchTimeoutMs);

    try {
      const response = await fetch(providerMediaUrl, {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Media fetch failed with status ${response.status}`);
      }

      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.byteLength === 0) {
        throw new Error('Downloaded media is empty');
      }

      return bytes;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async handleCommand(
    doctorProfileId: string,
    channel: ClinicalAiSessionRecord['channel'],
    channelThreadRef: string,
    command: SupportedCommand
  ): Promise<WebhookResult> {
    const session = await this.store.findMostRecentSession(doctorProfileId, channel, channelThreadRef);
    if (!session) {
      return {
        httpStatus: 200,
        body: {
          accepted: false,
          reason: 'session_not_found',
          message: 'No hay una sesion activa para este numero.',
        },
      };
    }

    if (command === 'estado') {
      return {
        httpStatus: 200,
        body: {
          accepted: true,
          sessionId: session.id,
          message: `Sesion ${session.status}.`,
        },
      };
    }

    if (command === 'cancelar') {
      const cancelledSession = await this.store.updateSession(session.id, { status: 'FAILED' });
      const cleanupJob = await this.store.createJob({
        sessionId: cancelledSession.id,
        stage: 'CLEANUP',
        queueName: STAGE_TO_QUEUE.CLEANUP,
        idempotencyKey: buildStageIdempotencyKey(cancelledSession.id, 'CLEANUP'),
      });

      return {
        httpStatus: 200,
        body: {
          accepted: true,
          sessionId: cancelledSession.id,
          message: 'Sesion cancelada.',
          jobIds: [cleanupJob.id],
        },
      };
    }

    const mediaItems = await this.store.listMediaItemsBySession(session.id);
    if (mediaItems.length === 0) {
      return {
        httpStatus: 200,
        body: {
          accepted: false,
          reason: 'no_audio_received',
          sessionId: session.id,
          message: 'No hay audio para procesar en esta sesion.',
        },
      };
    }

    const sealedSession = await this.store.updateSession(session.id, {
      status: 'SEALED',
      sessionSealedAt: nowIso(),
    });
    const sttSubmitJob = await this.store.createJob({
      sessionId: sealedSession.id,
      stage: 'STT_SUBMIT',
      queueName: STAGE_TO_QUEUE.STT_SUBMIT,
      idempotencyKey: buildStageIdempotencyKey(sealedSession.id, 'STT_SUBMIT'),
    });

    return {
      httpStatus: 200,
      body: {
        accepted: true,
        sessionId: sealedSession.id,
        message: 'Sesion cerrada. Procesando resumen clinico.',
        jobIds: [sttSubmitJob.id],
      },
    };
  }

  private validateInternalPayload<Stage extends InternalStageSlug>(
    stageSlug: Stage,
    payload: unknown
  ): StagePayloadMap[Stage] {
    try {
      switch (stageSlug) {
        case 'media-fetch':
          return MediaFetchPayloadSchema.parse(payload) as StagePayloadMap[Stage];
        case 'audio-prep':
          return AudioPrepPayloadSchema.parse(payload) as StagePayloadMap[Stage];
        case 'stt-submit':
          return SttSubmitPayloadSchema.parse(payload) as StagePayloadMap[Stage];
        case 'stt-finalize':
          return SttFinalizePayloadSchema.parse(payload) as StagePayloadMap[Stage];
        case 'normalize':
          return NormalizePayloadSchema.parse(payload) as StagePayloadMap[Stage];
        case 'reason':
          return ReasonPayloadSchema.parse(payload) as StagePayloadMap[Stage];
        case 'validate':
          return ValidatePayloadSchema.parse(payload) as StagePayloadMap[Stage];
        case 'deliver':
          return DeliverPayloadSchema.parse(payload) as StagePayloadMap[Stage];
        case 'cleanup':
          return CleanupPayloadSchema.parse(payload) as StagePayloadMap[Stage];
        default:
          throw new InvalidInternalPayloadError(`Unsupported stage ${stageSlug satisfies never}`);
      }
    } catch (e) {
      if (e instanceof z.ZodError) {
        throw new InvalidInternalPayloadError(`Invalid payload for ${stageSlug}: ${e.message}`);
      }
      throw e;
    }
  }
}

export function isInvalidInternalPayloadError(error: unknown): boolean {
  return error instanceof InvalidInternalPayloadError;
}

export function isPipelineExecutionError(error: unknown): boolean {
  return error instanceof PipelineExecutionError;
}

export function createService(config: AppConfig): ClinicalAiPipelineService {
  const artifactStorage = new LocalArtifactStorage(path.resolve(process.cwd(), config.localArtifactRoot));
  const speechToText = new SpeechToTextService(config, artifactStorage);
  const store: PipelineStore =
    config.supabaseUrl && config.supabaseServiceRoleKey
      ? new SupabasePipelineStore({
          supabaseUrl: config.supabaseUrl,
          supabaseServiceRoleKey: config.supabaseServiceRoleKey,
          fallbackBindings: config.doctorBindings,
        })
      : new InMemoryPipelineStore(config.doctorBindings);

  logger.info('Clinical AI pipeline store initialized', {
    store: store.kind,
    artifactRoot: path.resolve(process.cwd(), config.localArtifactRoot),
  });

  return new ClinicalAiPipelineService(config, store, artifactStorage, speechToText);
}
