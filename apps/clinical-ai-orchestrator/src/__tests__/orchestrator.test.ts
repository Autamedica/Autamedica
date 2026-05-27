import { describe, it, expect, vi } from 'vitest';
import { ClinicalAiPipelineService } from '../service.js';
import { InMemoryPipelineStore } from '../store.js';
import { LocalArtifactStorage } from '../artifact-storage.js';
import { SpeechToTextService } from '../stt.js';
import { AppConfig } from '../config.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

describe('Clinical AI Orchestrator - Direct Injection', () => {
  it('should accept a media-fetch job via direct injection', async () => {
    // Setup environment
    const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'clinical-ai-test-'));
    const config: AppConfig = {
      port: 3001,
      localArtifactRoot: testDir,
      mediaFetchTimeoutMs: 5000,
      sttProviderDefault: 'mock',
      ffmpegBinary: 'ffmpeg',
      ffprobeBinary: 'ffprobe',
      corsOrigin: '*',
      enableDebugState: true,
      skipTwilioSignatureValidation: true,
      googleSpeechModel: 'latest',
      doctorBindings: [],
    };

    const store = new InMemoryPipelineStore([]);
    const artifactStorage = new LocalArtifactStorage(testDir);
    const speechToText = { submit: vi.fn(), finalize: vi.fn() } as unknown as SpeechToTextService;
    
    // Mock global fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(Buffer.from('mock-audio-data')),
    }));

    await store.createSession({
      doctorProfileId: 'doc-123',
      channel: 'internal_upload',
      channelThreadRef: 'thread-123',
      providerName: 'internal',
    });
    // Create media item
    const mediaItem = await store.createMediaItem({
      sessionId: 'session-123',
      providerMessageId: 'msg-123',
      providerMediaIndex: 0,
      providerMediaUrl: 'https://test.com/audio.wav',
      contentType: 'audio/wav',
    });

    const service = new ClinicalAiPipelineService(config, store, artifactStorage, speechToText);

    // Mock Payload using the created IDs
    const payload = {
      schema_version: '1.0',
      job_id: 'job-123',
      session_id: 'session-123',
      media_item_id: mediaItem.id, // Use actual ID
      provider: 'internal',
      provider_message_id: 'msg-123',
      provider_media_index: 0,
    };

    // Inject directly
    const result = await service.acceptInternalJob('media-fetch', payload);

    expect(result.accepted).toBe(true);
    expect(result.stage).toBe('MEDIA_FETCH');
    expect(result.jobId).toBe('job-123');
    expect(result.jobStatus).toBe('RUNNING'); // Since fetch is async and external
  });
});
