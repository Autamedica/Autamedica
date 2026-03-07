import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AppConfig } from './config.js';
import { concatenateNormalizedAudio, probeAudio } from './audio.js';
import { LocalArtifactStorage } from './artifact-storage.js';
import {
  GoogleCloudAuthClient,
  GoogleCloudStorageClient,
  GoogleSpeechToTextClient,
} from './google-cloud.js';

export interface SttMediaItemRef {
  mediaItemId: string;
  storageUriNormalized: string;
  durationSeconds?: number;
}

export interface SttSubmitInput {
  sessionId: string;
  provider: string;
  languageCode: string;
  mediaItems: SttMediaItemRef[];
  diarizationEnabled: boolean;
  multiChannelEnabled: boolean;
}

export interface SttSubmitOutput {
  providerOperationRef: string;
  combinedStorageUri: string;
  submittedAudioUri?: string;
  durationSeconds?: number;
}

export interface SttFinalizeInput {
  sessionId: string;
  provider: string;
  providerOperationRef: string;
  languageCode: string;
  mediaItems: SttMediaItemRef[];
  diarizationEnabled: boolean;
  multiChannelEnabled: boolean;
}

export interface SttFinalizeOutput {
  transcriptPayload: unknown;
  transcriptText: string;
  transcriptSha256: string;
  confidenceSummary: Record<string, unknown>;
  wordCount: number;
  durationSeconds?: number;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function parseGoogleDurationSeconds(rawDuration: unknown): number | undefined {
  if (typeof rawDuration !== 'string' || rawDuration.length === 0) {
    return undefined;
  }

  const normalized = rawDuration.endsWith('s') ? rawDuration.slice(0, -1) : rawDuration;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
}

function extractGoogleTranscript(operationPayload: Record<string, unknown>): {
  transcriptText: string;
  confidenceSummary: Record<string, unknown>;
  durationSeconds?: number;
} {
  if (operationPayload.error && typeof operationPayload.error === 'object') {
    const errorPayload = operationPayload.error as Record<string, unknown>;
    throw new Error(`Speech-to-Text operation failed: ${String(errorPayload.message || 'unknown error')}`);
  }

  if (operationPayload.done !== true) {
    throw new Error('Speech-to-Text operation not finished yet');
  }

  const response = operationPayload.response;
  if (!response || typeof response !== 'object') {
    throw new Error('Speech-to-Text operation completed without response payload');
  }

  const resultEntries = Object.values((response as Record<string, unknown>).results || {});
  const firstResult = resultEntries[0];
  if (!firstResult || typeof firstResult !== 'object') {
    throw new Error('Speech-to-Text operation did not contain result entries');
  }

  const transcript = (firstResult as Record<string, unknown>).transcript;
  if (!transcript || typeof transcript !== 'object') {
    throw new Error('Speech-to-Text result did not contain transcript data');
  }

  const transcriptResults = Array.isArray((transcript as Record<string, unknown>).results)
    ? ((transcript as Record<string, unknown>).results as Array<Record<string, unknown>>)
    : [];

  const transcriptChunks: string[] = [];
  const confidences: number[] = [];

  for (const result of transcriptResults) {
    const alternatives = Array.isArray(result.alternatives)
      ? (result.alternatives as Array<Record<string, unknown>>)
      : [];
    const bestAlternative = alternatives[0];
    if (!bestAlternative) {
      continue;
    }

    if (typeof bestAlternative.transcript === 'string' && bestAlternative.transcript.trim().length > 0) {
      transcriptChunks.push(bestAlternative.transcript.trim());
    }

    if (typeof bestAlternative.confidence === 'number' && Number.isFinite(bestAlternative.confidence)) {
      confidences.push(bestAlternative.confidence);
    }
  }

  const transcriptText = transcriptChunks.join(' ').trim();
  if (!transcriptText) {
    throw new Error('Speech-to-Text returned an empty transcript');
  }

  const metadata =
    (transcript as Record<string, unknown>).metadata &&
    typeof (transcript as Record<string, unknown>).metadata === 'object'
      ? ((transcript as Record<string, unknown>).metadata as Record<string, unknown>)
      : {};

  return {
    transcriptText,
    confidenceSummary: {
      provider: 'google',
      resultCount: transcriptResults.length,
      ...(confidences.length > 0
        ? {
            averageConfidence:
              confidences.reduce((sum, value) => sum + value, 0) / confidences.length,
          }
        : {}),
    },
    ...(parseGoogleDurationSeconds(metadata.totalBilledDuration) !== undefined
      ? { durationSeconds: parseGoogleDurationSeconds(metadata.totalBilledDuration)! }
      : {}),
  };
}

export class SpeechToTextService {
  private googleAuthClientPromise?: Promise<GoogleCloudAuthClient | null>;

  constructor(
    private readonly config: AppConfig,
    private readonly artifactStorage: LocalArtifactStorage
  ) {}

  async submit(input: SttSubmitInput): Promise<SttSubmitOutput> {
    if (input.mediaItems.length === 0) {
      throw new Error('At least one normalized media item is required for STT submission');
    }

    await this.artifactStorage.ensureReady();
    const combinedTarget = await this.artifactStorage.prepareProcessingTarget({
      sessionId: input.sessionId,
      fileName: 'stt-input.wav',
    });
    const inputPaths = input.mediaItems.map((item) => this.artifactStorage.resolvePath(item.storageUriNormalized));

    await concatenateNormalizedAudio({
      inputPaths,
      outputPath: combinedTarget.filePath,
      ffmpegBinary: this.config.ffmpegBinary,
    });

    const probe = await probeAudio(combinedTarget.filePath, this.config.ffprobeBinary);
    if (input.provider === 'mock') {
      return {
        providerOperationRef: `mock:stt:${input.sessionId}`,
        combinedStorageUri: combinedTarget.storageUri,
        ...(probe.durationSeconds !== undefined ? { durationSeconds: probe.durationSeconds } : {}),
      };
    }

    if (input.provider !== 'google') {
      throw new Error(`Unsupported STT provider ${input.provider}`);
    }

    const authClient = await this.getGoogleAuthClient();
    if (!authClient) {
      throw new Error('Google STT requested but Google service account is not configured');
    }

    if (!this.config.googleCloudProjectId || !this.config.googleCloudStorageBucket) {
      throw new Error('GOOGLE_CLOUD_PROJECT_ID and GOOGLE_CLOUD_STORAGE_BUCKET are required for Google STT');
    }

    const location = this.config.googleCloudLocation || 'global';
    const recognizer = this.config.googleSpeechRecognizer || '_';
    const combinedBytes = await readFile(combinedTarget.filePath);
    const storageClient = new GoogleCloudStorageClient(authClient);
    const speechClient = new GoogleSpeechToTextClient(authClient);
    const objectName = `clinical-ai/sessions/${input.sessionId}/stt-input.wav`;

    const uploadResult = await storageClient.uploadObject({
      bucket: this.config.googleCloudStorageBucket,
      objectName,
      contentType: 'audio/wav',
      bytes: combinedBytes,
    });
    const sttResponse = await speechClient.batchRecognize({
      projectId: this.config.googleCloudProjectId,
      location,
      recognizer,
      audioUri: uploadResult.gcsUri,
      languageCode: input.languageCode,
      model: this.config.googleSpeechModel,
      diarizationEnabled: input.diarizationEnabled,
      multiChannelEnabled: input.multiChannelEnabled,
    });

    return {
      providerOperationRef: sttResponse.operationName,
      combinedStorageUri: combinedTarget.storageUri,
      submittedAudioUri: uploadResult.gcsUri,
      ...(probe.durationSeconds !== undefined ? { durationSeconds: probe.durationSeconds } : {}),
    };
  }

  async finalize(input: SttFinalizeInput): Promise<SttFinalizeOutput> {
    if (input.provider === 'mock') {
      const transcriptText =
        `MOCK_STT session=${input.sessionId} media_items=${input.mediaItems.length} ` +
        `language=${input.languageCode} diarization=${input.diarizationEnabled ? 'on' : 'off'}`;
      const transcriptPayload = {
        provider: 'mock',
        operationRef: input.providerOperationRef,
        transcriptText,
      };
      const transcriptSha256 = createHash('sha256').update(JSON.stringify(transcriptPayload)).digest('hex');
      const durationSeconds = input.mediaItems.reduce((sum, item) => sum + (item.durationSeconds || 0), 0);

      return {
        transcriptPayload,
        transcriptText,
        transcriptSha256,
        confidenceSummary: {
          provider: 'mock',
          deterministic: true,
        },
        wordCount: countWords(transcriptText),
        ...(durationSeconds > 0 ? { durationSeconds } : {}),
      };
    }

    if (input.provider !== 'google') {
      throw new Error(`Unsupported STT provider ${input.provider}`);
    }

    const authClient = await this.getGoogleAuthClient();
    if (!authClient) {
      throw new Error('Google STT requested but Google service account is not configured');
    }

    const speechClient = new GoogleSpeechToTextClient(authClient);
    const operationPayload = await speechClient.getOperation(input.providerOperationRef);
    const parsed = extractGoogleTranscript(operationPayload);
    const transcriptSha256 = createHash('sha256')
      .update(JSON.stringify(operationPayload))
      .digest('hex');

    return {
      transcriptPayload: operationPayload,
      transcriptText: parsed.transcriptText,
      transcriptSha256,
      confidenceSummary: parsed.confidenceSummary,
      wordCount: countWords(parsed.transcriptText),
      ...(parsed.durationSeconds !== undefined ? { durationSeconds: parsed.durationSeconds } : {}),
    };
  }

  private async getGoogleAuthClient(): Promise<GoogleCloudAuthClient | null> {
    if (!this.googleAuthClientPromise) {
      this.googleAuthClientPromise = GoogleCloudAuthClient.fromConfig({
        ...(this.config.googleServiceAccountJson ? { inlineJson: this.config.googleServiceAccountJson } : {}),
        ...(this.config.googleServiceAccountJsonPath ? { jsonPath: this.config.googleServiceAccountJsonPath } : {}),
      });
    }

    return this.googleAuthClientPromise;
  }
}
