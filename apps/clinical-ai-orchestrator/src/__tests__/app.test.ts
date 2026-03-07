import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import type { AppConfig } from '../config.js';
import { computeTwilioSignature } from '../twilio.js';

const tempRoots: string[] = [];

function createTestWavBuffer(durationMs = 300): Buffer {
  const sampleRate = 16000;
  const channelCount = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.max(1, Math.floor((sampleRate * durationMs) / 1000));
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const sample = Math.round(Math.sin(index / 12) * 2400);
    buffer.writeInt16LE(sample, 44 + index * 2);
  }

  return buffer;
}

async function createArtifactRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'clinical-ai-orchestrator-test-'));
  tempRoots.push(dir);
  return dir;
}

function createTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 8890,
    corsOrigin: 'http://localhost:3000',
    publicBaseUrl: 'https://clinical.example.com',
    twilioAuthToken: 'test-auth-token',
    twilioAccountSid: 'AC-test-001',
    skipTwilioSignatureValidation: true,
    internalApiKey: 'internal-test-key',
    enableDebugState: true,
    localArtifactRoot: path.join(tmpdir(), 'clinical-ai-orchestrator-default-test-artifacts'),
    ffmpegBinary: 'ffmpeg',
    ffprobeBinary: 'ffprobe',
    mediaFetchTimeoutMs: 10_000,
    sttProviderDefault: 'mock',
    googleSpeechModel: 'long',
    doctorBindings: [
      {
        id: 'binding-1',
        doctorProfileId: 'doctor-profile-1',
        channel: 'whatsapp',
        providerName: 'twilio',
        senderChannelId: 'whatsapp:+5491122334455',
        active: true,
      },
    ],
    ...overrides,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();

  while (tempRoots.length > 0) {
    const dir = tempRoots.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

describe('clinical ai orchestrator', () => {
  it('creates a session, media item and media fetch job for inbound audio', async () => {
    const artifactRoot = await createArtifactRoot();
    const { app } = createApp(createTestConfig({ localArtifactRoot: artifactRoot }));

    const response = await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .type('form')
      .send({
        MessageSid: 'SM-audio-001',
        AccountSid: 'AC-test-001',
        From: 'whatsapp:+5491122334455',
        To: 'whatsapp:+14155238886',
        WaId: '5491122334455',
        ProfileName: 'Dr Carlos',
        Body: '',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.test/media/0',
        MediaContentType0: 'audio/wav',
        MessageStatus: 'received',
      })
      .expect(200);

    expect(response.body.accepted).toBe(true);
    expect(response.body.sessionId).toBeTypeOf('string');
    expect(response.body.jobIds).toHaveLength(1);

    const state = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);
    expect(state.body.storeKind).toBe('memory');
    expect(state.body.sessions).toHaveLength(1);
    expect(state.body.mediaItems).toHaveLength(1);
    expect(state.body.jobs).toHaveLength(1);
    expect(state.body.jobs[0].stage).toBe('MEDIA_FETCH');
  });

  it('returns the previous response for duplicate inbound requests', async () => {
    const artifactRoot = await createArtifactRoot();
    const { app } = createApp(createTestConfig({ localArtifactRoot: artifactRoot }));

    const payload = {
      MessageSid: 'SM-duplicate-001',
      AccountSid: 'AC-test-001',
      From: 'whatsapp:+5491122334455',
      To: 'whatsapp:+14155238886',
      WaId: '5491122334455',
      ProfileName: 'Dr Carlos',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.test/media/0',
      MediaContentType0: 'audio/wav',
      MessageStatus: 'received',
    };

    await request(app).post('/api/v1/whatsapp/webhooks/inbound').type('form').send(payload).expect(200);
    const duplicate = await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .type('form')
      .send(payload)
      .expect(200);

    expect(duplicate.body.accepted).toBe(true);
    expect(duplicate.body.duplicate).toBe(true);

    const state = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);
    expect(state.body.sessions).toHaveLength(1);
    expect(state.body.mediaItems).toHaveLength(1);
    expect(state.body.jobs).toHaveLength(1);
  });

  it('seals the session and creates an stt submit job when receiving /finalizar', async () => {
    const artifactRoot = await createArtifactRoot();
    const { app } = createApp(createTestConfig({ localArtifactRoot: artifactRoot }));

    await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .type('form')
      .send({
        MessageSid: 'SM-session-001',
        AccountSid: 'AC-test-001',
        From: 'whatsapp:+5491122334455',
        To: 'whatsapp:+14155238886',
        Body: '',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.test/media/0',
        MediaContentType0: 'audio/wav',
        MessageStatus: 'received',
      })
      .expect(200);

    const response = await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .type('form')
      .send({
        MessageSid: 'SM-session-finalize-001',
        AccountSid: 'AC-test-001',
        From: 'whatsapp:+5491122334455',
        To: 'whatsapp:+14155238886',
        Body: '/finalizar',
        NumMedia: '0',
        MessageStatus: 'received',
      })
      .expect(200);

    expect(response.body.accepted).toBe(true);
    expect(response.body.jobIds).toHaveLength(1);

    const state = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);
    expect(state.body.sessions[0].status).toBe('SEALED');
    expect(state.body.jobs).toHaveLength(2);
    expect(state.body.jobs[1].stage).toBe('STT_SUBMIT');
  });

  it('validates the Twilio signature when signature validation is enabled', async () => {
    const artifactRoot = await createArtifactRoot();
    const config = createTestConfig({
      localArtifactRoot: artifactRoot,
      skipTwilioSignatureValidation: false,
    });
    const { app } = createApp(config);

    const form = {
      MessageSid: 'SM-signature-001',
      AccountSid: 'AC-test-001',
      From: 'whatsapp:+5491122334455',
      To: 'whatsapp:+14155238886',
      Body: '',
      NumMedia: '1',
      MediaUrl0: 'https://api.twilio.test/media/0',
      MediaContentType0: 'audio/wav',
      MessageStatus: 'received',
    };
    const requestUrl = 'https://clinical.example.com/api/v1/whatsapp/webhooks/inbound';
    const signature = computeTwilioSignature(config.twilioAuthToken!, requestUrl, form);

    await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .set('X-Twilio-Signature', signature)
      .type('form')
      .send(form)
      .expect(200);

    await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .set('X-Twilio-Signature', 'invalid-signature')
      .type('form')
      .send({
        ...form,
        MessageSid: 'SM-signature-002',
      })
      .expect(403);
  });

  it('executes media-fetch and creates the audio-prep job', async () => {
    const artifactRoot = await createArtifactRoot();
    const { app } = createApp(createTestConfig({ localArtifactRoot: artifactRoot }));
    const wavBuffer = createTestWavBuffer();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(wavBuffer, {
        status: 200,
        headers: {
          'content-type': 'audio/wav',
        },
      })
    );

    await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .type('form')
      .send({
        MessageSid: 'SM-fetch-001',
        AccountSid: 'AC-test-001',
        From: 'whatsapp:+5491122334455',
        To: 'whatsapp:+14155238886',
        Body: '',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.test/media/fetch-001',
        MediaContentType0: 'audio/wav',
        MessageStatus: 'received',
      })
      .expect(200);

    const preState = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    const job = preState.body.jobs[0];
    const mediaItem = preState.body.mediaItems[0];

    const response = await request(app)
      .post('/internal/jobs/media-fetch')
      .set('x-internal-api-key', 'internal-test-key')
      .send({
        schema_version: 'v1',
        job_id: job.id,
        session_id: job.sessionId,
        media_item_id: mediaItem.id,
        provider: 'twilio',
        provider_message_id: mediaItem.providerMessageId,
        provider_media_index: mediaItem.providerMediaIndex,
      })
      .expect(200);

    expect(response.body.accepted).toBe(true);
    expect(response.body.stage).toBe('MEDIA_FETCH');
    expect(response.body.jobStatus).toBe('SUCCEEDED');
    expect(response.body.mediaItemStatus).toBe('FETCHED');
    expect(response.body.nextJobIds).toHaveLength(1);

    const rawPath = fileURLToPath(response.body.artifacts.storageUriRaw);
    await expect(access(rawPath)).resolves.toBeUndefined();

    const state = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);
    expect(state.body.mediaItems[0].status).toBe('FETCHED');
    expect(state.body.jobs).toHaveLength(2);
    expect(state.body.jobs[1].stage).toBe('AUDIO_PREP');
  });

  it('executes audio-prep and persists normalized audio metadata', async () => {
    const artifactRoot = await createArtifactRoot();
    const { app } = createApp(createTestConfig({ localArtifactRoot: artifactRoot }));
    const wavBuffer = createTestWavBuffer(500);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(wavBuffer, {
        status: 200,
        headers: {
          'content-type': 'audio/wav',
        },
      })
    );

    await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .type('form')
      .send({
        MessageSid: 'SM-audio-prep-001',
        AccountSid: 'AC-test-001',
        From: 'whatsapp:+5491122334455',
        To: 'whatsapp:+14155238886',
        Body: '',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.test/media/audio-prep-001',
        MediaContentType0: 'audio/wav',
        MessageStatus: 'received',
      })
      .expect(200);

    const preFetchState = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    const mediaFetchJob = preFetchState.body.jobs[0];
    const mediaItem = preFetchState.body.mediaItems[0];

    await request(app)
      .post('/internal/jobs/media-fetch')
      .set('x-internal-api-key', 'internal-test-key')
      .send({
        schema_version: 'v1',
        job_id: mediaFetchJob.id,
        session_id: mediaFetchJob.sessionId,
        media_item_id: mediaItem.id,
        provider: 'twilio',
        provider_message_id: mediaItem.providerMessageId,
        provider_media_index: mediaItem.providerMediaIndex,
      })
      .expect(200);

    const preAudioPrepState = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    const audioPrepJob = preAudioPrepState.body.jobs.find((jobItem: { stage: string }) => jobItem.stage === 'AUDIO_PREP');
    const fetchedMediaItem = preAudioPrepState.body.mediaItems[0];

    const response = await request(app)
      .post('/internal/jobs/audio-prep')
      .set('x-internal-api-key', 'internal-test-key')
      .send({
        schema_version: 'v1',
        job_id: audioPrepJob.id,
        session_id: audioPrepJob.sessionId,
        media_item_id: fetchedMediaItem.id,
        storage_uri_raw: fetchedMediaItem.storageUriRaw,
      })
      .expect(200);

    expect(response.body.accepted).toBe(true);
    expect(response.body.stage).toBe('AUDIO_PREP');
    expect(response.body.jobStatus).toBe('SUCCEEDED');
    expect(response.body.mediaItemStatus).toBe('NORMALIZED');
    expect(response.body.artifacts.storageUriNormalized).toBeTypeOf('string');

    const normalizedPath = fileURLToPath(response.body.artifacts.storageUriNormalized);
    await expect(access(normalizedPath)).resolves.toBeUndefined();

    const finalState = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    expect(finalState.body.mediaItems[0].status).toBe('NORMALIZED');
    expect(finalState.body.mediaItems[0].storageUriNormalized).toBeTypeOf('string');
    expect(finalState.body.mediaItems[0].durationSeconds).toBeGreaterThanOrEqual(0);
  });

  it('executes stt-submit and stt-finalize in mock mode and persists a transcript', async () => {
    const artifactRoot = await createArtifactRoot();
    const { app } = createApp(createTestConfig({ localArtifactRoot: artifactRoot, sttProviderDefault: 'mock' }));
    const wavBuffer = createTestWavBuffer(700);

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(wavBuffer, {
        status: 200,
        headers: {
          'content-type': 'audio/wav',
        },
      })
    );

    await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .type('form')
      .send({
        MessageSid: 'SM-stt-001',
        AccountSid: 'AC-test-001',
        From: 'whatsapp:+5491122334455',
        To: 'whatsapp:+14155238886',
        Body: '',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.test/media/stt-001',
        MediaContentType0: 'audio/wav',
        MessageStatus: 'received',
      })
      .expect(200);

    let state = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    const mediaFetchJob = state.body.jobs.find((jobItem: { stage: string }) => jobItem.stage === 'MEDIA_FETCH');
    const mediaItem = state.body.mediaItems[0];

    await request(app)
      .post('/internal/jobs/media-fetch')
      .set('x-internal-api-key', 'internal-test-key')
      .send({
        schema_version: 'v1',
        job_id: mediaFetchJob.id,
        session_id: mediaFetchJob.sessionId,
        media_item_id: mediaItem.id,
        provider: 'twilio',
        provider_message_id: mediaItem.providerMessageId,
        provider_media_index: mediaItem.providerMediaIndex,
      })
      .expect(200);

    state = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    const audioPrepJob = state.body.jobs.find((jobItem: { stage: string }) => jobItem.stage === 'AUDIO_PREP');
    const fetchedMediaItem = state.body.mediaItems[0];

    await request(app)
      .post('/internal/jobs/audio-prep')
      .set('x-internal-api-key', 'internal-test-key')
      .send({
        schema_version: 'v1',
        job_id: audioPrepJob.id,
        session_id: audioPrepJob.sessionId,
        media_item_id: fetchedMediaItem.id,
        storage_uri_raw: fetchedMediaItem.storageUriRaw,
      })
      .expect(200);

    await request(app)
      .post('/api/v1/whatsapp/webhooks/inbound')
      .type('form')
      .send({
        MessageSid: 'SM-stt-finalizar-001',
        AccountSid: 'AC-test-001',
        From: 'whatsapp:+5491122334455',
        To: 'whatsapp:+14155238886',
        Body: '/finalizar',
        NumMedia: '0',
        MessageStatus: 'received',
      })
      .expect(200);

    state = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    const normalizedMediaItem = state.body.mediaItems[0];
    const sttSubmitJob = state.body.jobs.find((jobItem: { stage: string }) => jobItem.stage === 'STT_SUBMIT');

    const sttSubmitResponse = await request(app)
      .post('/internal/jobs/stt-submit')
      .set('x-internal-api-key', 'internal-test-key')
      .send({
        schema_version: 'v1',
        job_id: sttSubmitJob.id,
        session_id: sttSubmitJob.sessionId,
        doctor_profile_id: 'doctor-profile-1',
        language_code: 'es-AR',
        media_items: [
          {
            media_item_id: normalizedMediaItem.id,
            storage_uri_normalized: normalizedMediaItem.storageUriNormalized,
          },
        ],
        stt_config: {
          provider: 'mock',
          diarization_enabled: true,
          multi_channel_enabled: false,
          phrase_set_key: 'default',
        },
      })
      .expect(200);

    expect(sttSubmitResponse.body.jobStatus).toBe('SUCCEEDED');
    expect(sttSubmitResponse.body.providerOperationRef).toBeTypeOf('string');
    expect(sttSubmitResponse.body.nextJobIds).toHaveLength(1);
    expect(sttSubmitResponse.body.artifacts.combinedStorageUri).toBeTypeOf('string');

    state = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    const sttFinalizeJob = state.body.jobs.find((jobItem: { stage: string }) => jobItem.stage === 'STT_FINALIZE');

    const sttFinalizeResponse = await request(app)
      .post('/internal/jobs/stt-finalize')
      .set('x-internal-api-key', 'internal-test-key')
      .send({
        schema_version: 'v1',
        job_id: sttFinalizeJob.id,
        session_id: sttFinalizeJob.sessionId,
        provider: 'mock',
        provider_operation_ref: sttSubmitResponse.body.providerOperationRef,
        language_code: 'es-AR',
        diarization_enabled: true,
        multi_channel_enabled: false,
      })
      .expect(200);

    expect(sttFinalizeResponse.body.jobStatus).toBe('SUCCEEDED');
    expect(sttFinalizeResponse.body.transcriptId).toBeTypeOf('string');
    expect(sttFinalizeResponse.body.nextJobIds).toHaveLength(1);
    expect(sttFinalizeResponse.body.artifacts.transcriptUri).toBeTypeOf('string');

    const transcriptPath = fileURLToPath(sttFinalizeResponse.body.artifacts.transcriptUri);
    await expect(access(transcriptPath)).resolves.toBeUndefined();

    const finalState = await request(app)
      .get('/internal/state')
      .set('x-internal-api-key', 'internal-test-key')
      .expect(200);

    expect(finalState.body.transcripts).toHaveLength(1);
    expect(finalState.body.transcripts[0].sttProvider).toBe('mock');
    expect(finalState.body.jobs.some((jobItem: { stage: string }) => jobItem.stage === 'NORMALIZE')).toBe(true);
  });
});
