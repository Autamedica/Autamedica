export type Channel = 'whatsapp' | 'pwa' | 'internal_upload';

export type ProviderName = 'twilio' | 'meta_bsp' | 'internal';

export type SessionStatus =
  | 'OPEN'
  | 'WAITING_FOR_MORE_AUDIO'
  | 'SEALED'
  | 'PROCESSING'
  | 'READY_TO_DELIVER'
  | 'DELIVERED'
  | 'FAILED'
  | 'PURGED';

export type MediaItemStatus = 'RECEIVED' | 'FETCHED' | 'NORMALIZED' | 'REJECTED' | 'FAILED' | 'PURGED';

export type JobStage =
  | 'MEDIA_FETCH'
  | 'AUDIO_PREP'
  | 'STT_SUBMIT'
  | 'STT_FINALIZE'
  | 'NORMALIZE'
  | 'REASON'
  | 'VALIDATE'
  | 'DELIVER'
  | 'CLEANUP';

export type JobStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL' | 'CANCELLED';

export type OutputStatus = 'GENERATED' | 'VALIDATED' | 'REJECTED' | 'ABSTAINED';

export type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED_RETRYABLE' | 'FAILED_FINAL';

export type SupportedCommand = 'finalizar' | 'cancelar' | 'estado';
export type PipelineStoreKind = 'memory' | 'supabase';

export interface ChannelBinding {
  id: string;
  doctorProfileId: string;
  channel: Channel;
  providerName: ProviderName | string;
  senderChannelId: string;
  senderWaId?: string;
  displayName?: string;
  active: boolean;
  verifiedAt?: string;
}

export interface TwilioInboundForm {
  MessageSid?: string;
  AccountSid?: string;
  From?: string;
  To?: string;
  WaId?: string;
  ProfileName?: string;
  Body?: string;
  NumMedia?: string;
  MessageStatus?: string;
  [key: string]: string | undefined;
}

export interface CanonicalMediaItemEnvelope {
  providerMediaIndex: number;
  providerMediaUrl: string;
  contentType: string;
}

export interface CanonicalInboundEnvelope {
  provider: ProviderName;
  providerMessageId: string;
  providerAccountId?: string;
  channel: Channel;
  senderChannelId: string;
  senderWaId?: string;
  senderProfileName?: string;
  recipientChannelId: string;
  messageStatus?: string;
  messageText: string;
  numMedia: number;
  mediaItems: CanonicalMediaItemEnvelope[];
  receivedAt: string;
}

export interface ClinicalAiSessionRecord {
  id: string;
  doctorProfileId: string;
  patientProfileId?: string;
  channel: Channel;
  channelThreadRef: string;
  providerName: string;
  status: SessionStatus;
  languageCode?: string;
  specialtyHint?: string;
  sessionOpenedAt: string;
  sessionSealedAt?: string;
  processingStartedAt?: string;
  deliveryCompletedAt?: string;
  retentionExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalAiMediaItemRecord {
  id: string;
  sessionId: string;
  providerMessageId: string;
  providerMediaIndex: number;
  providerMediaUrl: string;
  contentType: string;
  sizeBytes?: number;
  durationSeconds?: number;
  sha256?: string;
  storageUriRaw?: string;
  storageUriNormalized?: string;
  status: MediaItemStatus;
  receivedAt: string;
  downloadedAt?: string;
  normalizedAt?: string;
  retentionExpiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalAiJobRecord {
  id: string;
  sessionId: string;
  mediaItemId?: string;
  stage: JobStage;
  status: JobStatus;
  attempt: number;
  idempotencyKey: string;
  queueName: string;
  providerOperationRef?: string;
  errorCode?: string;
  errorMessageRedacted?: string;
  scheduledAt: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClinicalAiTranscriptRecord {
  id: string;
  sessionId: string;
  mediaItemId?: string;
  sttProvider: string;
  languageCode: string;
  diarizationEnabled: boolean;
  multiChannelEnabled: boolean;
  transcriptUri: string;
  transcriptSha256: string;
  confidenceSummary: Record<string, unknown>;
  wordCount?: number;
  durationSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookResultBody {
  accepted: boolean;
  duplicate?: boolean;
  reason?: string;
  sessionId?: string;
  message?: string;
  jobIds?: string[];
}

export interface WebhookResult {
  httpStatus: number;
  body: WebhookResultBody;
}

export interface InternalJobAcceptanceResult {
  accepted: boolean;
  duplicate: boolean;
  stage: JobStage;
  queueName: string;
  jobId: string;
  sessionId: string;
}

export interface InternalJobExecutionResult extends InternalJobAcceptanceResult {
  jobStatus: JobStatus;
  mediaItemStatus?: MediaItemStatus;
  message?: string;
  nextJobIds?: string[];
  providerOperationRef?: string;
  transcriptId?: string;
  artifacts?: {
    sizeBytes?: number;
    durationSeconds?: number;
    sha256?: string;
    combinedStorageUri?: string;
    submittedAudioUri?: string;
    transcriptUri?: string;
    storageUriRaw?: string;
    storageUriNormalized?: string;
  };
}

export interface StagePayloadMap {
  'media-fetch': {
    schema_version: string;
    job_id: string;
    session_id: string;
    media_item_id: string;
    provider: string;
    provider_message_id: string;
    provider_media_index: number;
  };
  'audio-prep': {
    schema_version: string;
    job_id: string;
    session_id: string;
    media_item_id: string;
    storage_uri_raw: string;
  };
  'stt-submit': {
    schema_version: string;
    job_id: string;
    session_id: string;
    doctor_profile_id: string;
    language_code: string;
    media_items: Array<{
      media_item_id: string;
      storage_uri_normalized: string;
    }>;
    stt_config: {
      provider: string;
      diarization_enabled: boolean;
      multi_channel_enabled: boolean;
      phrase_set_key: string;
    };
  };
  'stt-finalize': {
    schema_version: string;
    job_id: string;
    session_id: string;
    provider: string;
    provider_operation_ref: string;
    language_code?: string;
    diarization_enabled?: boolean;
    multi_channel_enabled?: boolean;
  };
  normalize: {
    schema_version: string;
    job_id: string;
    session_id: string;
    transcript_id: string;
    normalizer_version: string;
  };
  reason: {
    schema_version: string;
    job_id: string;
    session_id: string;
    normalized_transcript_id: string;
    context_snapshot_id: string;
    prompt_version: string;
    schema_name: string;
    model_name: string;
    model_version: string;
  };
  validate: {
    schema_version: string;
    job_id: string;
    session_id: string;
    output_id: string;
    validator_version: string;
  };
  deliver: {
    schema_version: string;
    job_id: string;
    session_id: string;
    output_id: string;
    channel: string;
    provider: string;
  };
  cleanup: {
    schema_version: string;
    job_id: string;
    session_id: string;
    reason: string;
  };
}

export type InternalStageSlug = keyof StagePayloadMap;

export interface StateSnapshot {
  storeKind: PipelineStoreKind;
  bindings: ChannelBinding[];
  sessions: ClinicalAiSessionRecord[];
  mediaItems: ClinicalAiMediaItemRecord[];
  jobs: ClinicalAiJobRecord[];
  transcripts: ClinicalAiTranscriptRecord[];
  inboundIdempotencyKeys: string[];
}
