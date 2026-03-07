import { randomUUID } from 'node:crypto';
import type {
  Channel,
  ChannelBinding,
  ClinicalAiJobRecord,
  ClinicalAiMediaItemRecord,
  ClinicalAiSessionRecord,
  ClinicalAiTranscriptRecord,
  JobStage,
  PipelineStoreKind,
  StateSnapshot,
} from './types.js';

export interface CreateSessionInput {
  doctorProfileId: string;
  channel: Channel;
  channelThreadRef: string;
  providerName: string;
}

export interface CreateMediaItemInput {
  sessionId: string;
  providerMessageId: string;
  providerMediaIndex: number;
  providerMediaUrl: string;
  contentType: string;
}

export interface CreateJobInput {
  id?: string;
  sessionId: string;
  mediaItemId?: string;
  stage: JobStage;
  queueName: string;
  idempotencyKey: string;
}

export interface CreateTranscriptInput {
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
}

export interface PipelineStore {
  readonly kind: PipelineStoreKind;
  resolveBinding(providerName: string, channel: Channel, senderChannelId: string): Promise<ChannelBinding | undefined>;
  getInboundResult<T>(idempotencyKey: string): Promise<T | undefined>;
  setInboundResult(idempotencyKey: string, result: unknown): Promise<void>;
  findOpenSession(
    doctorProfileId: string,
    channel: Channel,
    channelThreadRef: string
  ): Promise<ClinicalAiSessionRecord | undefined>;
  findMostRecentSession(
    doctorProfileId: string,
    channel: Channel,
    channelThreadRef: string
  ): Promise<ClinicalAiSessionRecord | undefined>;
  getSession(sessionId: string): Promise<ClinicalAiSessionRecord | undefined>;
  createSession(input: CreateSessionInput): Promise<ClinicalAiSessionRecord>;
  updateSession(sessionId: string, patch: Partial<ClinicalAiSessionRecord>): Promise<ClinicalAiSessionRecord>;
  createMediaItem(input: CreateMediaItemInput): Promise<ClinicalAiMediaItemRecord>;
  getMediaItem(mediaItemId: string): Promise<ClinicalAiMediaItemRecord | undefined>;
  updateMediaItem(mediaItemId: string, patch: Partial<ClinicalAiMediaItemRecord>): Promise<ClinicalAiMediaItemRecord>;
  listMediaItemsBySession(sessionId: string): Promise<ClinicalAiMediaItemRecord[]>;
  getJob(jobId: string): Promise<ClinicalAiJobRecord | undefined>;
  createJob(input: CreateJobInput): Promise<ClinicalAiJobRecord>;
  updateJob(jobId: string, patch: Partial<ClinicalAiJobRecord>): Promise<ClinicalAiJobRecord>;
  createTranscript(input: CreateTranscriptInput): Promise<ClinicalAiTranscriptRecord>;
  listTranscriptsBySession(sessionId: string): Promise<ClinicalAiTranscriptRecord[]>;
  snapshot(): Promise<StateSnapshot>;
}

function nowIso(): string {
  return new Date().toISOString();
}

function retentionIso(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function sortByDescending<T>(items: T[], pickIso: (item: T) => string): T[] {
  return [...items].sort((left, right) => pickIso(right).localeCompare(pickIso(left)));
}

export class InMemoryPipelineStore implements PipelineStore {
  readonly kind: PipelineStoreKind = 'memory';
  private readonly bindings: ChannelBinding[];
  private readonly sessions = new Map<string, ClinicalAiSessionRecord>();
  private readonly mediaItems = new Map<string, ClinicalAiMediaItemRecord>();
  private readonly mediaItemByProviderKey = new Map<string, string>();
  private readonly jobs = new Map<string, ClinicalAiJobRecord>();
  private readonly jobsByIdempotencyKey = new Map<string, string>();
  private readonly transcripts = new Map<string, ClinicalAiTranscriptRecord>();
  private readonly inboundResults = new Map<string, unknown>();

  constructor(bindings: ChannelBinding[]) {
    this.bindings = bindings;
  }

  async resolveBinding(providerName: string, channel: Channel, senderChannelId: string): Promise<ChannelBinding | undefined> {
    return this.bindings.find(
      (binding) =>
        binding.active &&
        binding.providerName === providerName &&
        binding.channel === channel &&
        binding.senderChannelId === senderChannelId
    );
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
    const sessions = Array.from(this.sessions.values()).filter(
      (session) =>
        session.doctorProfileId === doctorProfileId &&
        session.channel === channel &&
        session.channelThreadRef === channelThreadRef &&
        (session.status === 'OPEN' || session.status === 'WAITING_FOR_MORE_AUDIO')
    );

    return sortByDescending(sessions, (session) => session.sessionOpenedAt)[0];
  }

  async findMostRecentSession(
    doctorProfileId: string,
    channel: Channel,
    channelThreadRef: string
  ): Promise<ClinicalAiSessionRecord | undefined> {
    const sessions = Array.from(this.sessions.values()).filter(
      (session) =>
        session.doctorProfileId === doctorProfileId &&
        session.channel === channel &&
        session.channelThreadRef === channelThreadRef
    );

    return sortByDescending(sessions, (session) => session.sessionOpenedAt)[0];
  }

  async getSession(sessionId: string): Promise<ClinicalAiSessionRecord | undefined> {
    return this.sessions.get(sessionId);
  }

  async createSession(input: CreateSessionInput): Promise<ClinicalAiSessionRecord> {
    const timestamp = nowIso();
    const session: ClinicalAiSessionRecord = {
      id: randomUUID(),
      doctorProfileId: input.doctorProfileId,
      channel: input.channel,
      channelThreadRef: input.channelThreadRef,
      providerName: input.providerName,
      status: 'OPEN',
      sessionOpenedAt: timestamp,
      retentionExpiresAt: retentionIso(7),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.sessions.set(session.id, session);
    return session;
  }

  async updateSession(sessionId: string, patch: Partial<ClinicalAiSessionRecord>): Promise<ClinicalAiSessionRecord> {
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const next: ClinicalAiSessionRecord = {
      ...current,
      ...patch,
      updatedAt: nowIso(),
    };

    this.sessions.set(sessionId, next);
    return next;
  }

  async createMediaItem(input: CreateMediaItemInput): Promise<ClinicalAiMediaItemRecord> {
    const providerKey = `${input.providerMessageId}:${input.providerMediaIndex}`;
    const existingId = this.mediaItemByProviderKey.get(providerKey);
    if (existingId) {
      const existing = this.mediaItems.get(existingId);
      if (!existing) {
        throw new Error(`Media item ${existingId} not found`);
      }

      return existing;
    }

    const timestamp = nowIso();
    const mediaItem: ClinicalAiMediaItemRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      providerMessageId: input.providerMessageId,
      providerMediaIndex: input.providerMediaIndex,
      providerMediaUrl: input.providerMediaUrl,
      contentType: input.contentType,
      status: 'RECEIVED',
      receivedAt: timestamp,
      retentionExpiresAt: retentionIso(7),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.mediaItems.set(mediaItem.id, mediaItem);
    this.mediaItemByProviderKey.set(providerKey, mediaItem.id);
    return mediaItem;
  }

  async getMediaItem(mediaItemId: string): Promise<ClinicalAiMediaItemRecord | undefined> {
    return this.mediaItems.get(mediaItemId);
  }

  async updateMediaItem(
    mediaItemId: string,
    patch: Partial<ClinicalAiMediaItemRecord>
  ): Promise<ClinicalAiMediaItemRecord> {
    const current = this.mediaItems.get(mediaItemId);
    if (!current) {
      throw new Error(`Media item ${mediaItemId} not found`);
    }

    const next: ClinicalAiMediaItemRecord = {
      ...current,
      ...patch,
      updatedAt: nowIso(),
    };

    this.mediaItems.set(mediaItemId, next);
    return next;
  }

  async listMediaItemsBySession(sessionId: string): Promise<ClinicalAiMediaItemRecord[]> {
    return Array.from(this.mediaItems.values())
      .filter((mediaItem) => mediaItem.sessionId === sessionId)
      .sort((left, right) => left.receivedAt.localeCompare(right.receivedAt));
  }

  async getJob(jobId: string): Promise<ClinicalAiJobRecord | undefined> {
    return this.jobs.get(jobId);
  }

  async createJob(input: CreateJobInput): Promise<ClinicalAiJobRecord> {
    const existingId = this.jobsByIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.jobs.get(existingId);
      if (!existing) {
        throw new Error(`Job ${existingId} not found`);
      }

      return existing;
    }

    const timestamp = nowIso();
    const job: ClinicalAiJobRecord = {
      id: input.id || randomUUID(),
      sessionId: input.sessionId,
      stage: input.stage,
      status: 'PENDING',
      attempt: 1,
      idempotencyKey: input.idempotencyKey,
      queueName: input.queueName,
      scheduledAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.mediaItemId ? { mediaItemId: input.mediaItemId } : {}),
    };

    this.jobs.set(job.id, job);
    this.jobsByIdempotencyKey.set(job.idempotencyKey, job.id);
    return job;
  }

  async updateJob(jobId: string, patch: Partial<ClinicalAiJobRecord>): Promise<ClinicalAiJobRecord> {
    const current = this.jobs.get(jobId);
    if (!current) {
      throw new Error(`Job ${jobId} not found`);
    }

    const next: ClinicalAiJobRecord = {
      ...current,
      ...patch,
      updatedAt: nowIso(),
    };

    this.jobs.set(jobId, next);
    return next;
  }

  async createTranscript(input: CreateTranscriptInput): Promise<ClinicalAiTranscriptRecord> {
    const timestamp = nowIso();
    const transcript: ClinicalAiTranscriptRecord = {
      id: randomUUID(),
      sessionId: input.sessionId,
      sttProvider: input.sttProvider,
      languageCode: input.languageCode,
      diarizationEnabled: input.diarizationEnabled,
      multiChannelEnabled: input.multiChannelEnabled,
      transcriptUri: input.transcriptUri,
      transcriptSha256: input.transcriptSha256,
      confidenceSummary: input.confidenceSummary,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...(input.mediaItemId ? { mediaItemId: input.mediaItemId } : {}),
      ...(input.wordCount !== undefined ? { wordCount: input.wordCount } : {}),
      ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
    };

    this.transcripts.set(transcript.id, transcript);
    return transcript;
  }

  async listTranscriptsBySession(sessionId: string): Promise<ClinicalAiTranscriptRecord[]> {
    return Array.from(this.transcripts.values())
      .filter((transcript) => transcript.sessionId === sessionId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async snapshot(): Promise<StateSnapshot> {
    return {
      storeKind: this.kind,
      bindings: [...this.bindings],
      sessions: [...this.sessions.values()],
      mediaItems: [...this.mediaItems.values()],
      jobs: [...this.jobs.values()],
      transcripts: [...this.transcripts.values()],
      inboundIdempotencyKeys: [...this.inboundResults.keys()],
    };
  }
}
