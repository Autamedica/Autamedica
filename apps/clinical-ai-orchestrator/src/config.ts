import type { ChannelBinding } from './types.js';

export interface AppConfig {
  port: number;
  corsOrigin: string;
  publicBaseUrl?: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  twilioAuthToken?: string;
  twilioAccountSid?: string;
  skipTwilioSignatureValidation: boolean;
  internalApiKey?: string;
  enableDebugState: boolean;
  localArtifactRoot: string;
  ffmpegBinary: string;
  ffprobeBinary: string;
  mediaFetchTimeoutMs: number;
  sttProviderDefault: 'mock' | 'google';
  googleCloudProjectId?: string;
  googleCloudLocation?: string;
  googleCloudStorageBucket?: string;
  googleSpeechRecognizer?: string;
  googleSpeechModel: string;
  googleServiceAccountJson?: string;
  googleServiceAccountJsonPath?: string;
  doctorBindings: ChannelBinding[];
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return value === '1' || value.toLowerCase() === 'true' || value.toLowerCase() === 'yes';
}

function parseDoctorBindings(raw: string | undefined): ChannelBinding[] {
  if (!raw) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('WHATSAPP_DOCTOR_BINDINGS_JSON must be a JSON array');
  }

  return parsed.map((binding, index) => {
    if (!binding || typeof binding !== 'object') {
      throw new Error(`Invalid doctor binding at index ${index}`);
    }

    const candidate = binding as Record<string, unknown>;
    const doctorProfileId = candidate.doctorProfileId;
    const channel = candidate.channel;
    const providerName = candidate.providerName;
    const senderChannelId = candidate.senderChannelId;
    const active = candidate.active;

    if (typeof doctorProfileId !== 'string' || !doctorProfileId) {
      throw new Error(`doctorProfileId is required for binding at index ${index}`);
    }

    if (typeof channel !== 'string' || !channel) {
      throw new Error(`channel is required for binding at index ${index}`);
    }

    if (typeof providerName !== 'string' || !providerName) {
      throw new Error(`providerName is required for binding at index ${index}`);
    }

    if (typeof senderChannelId !== 'string' || !senderChannelId) {
      throw new Error(`senderChannelId is required for binding at index ${index}`);
    }

    return {
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : `binding-${index + 1}`,
      doctorProfileId,
      channel: channel as ChannelBinding['channel'],
      providerName,
      senderChannelId,
      active: typeof active === 'boolean' ? active : true,
      ...(typeof candidate.senderWaId === 'string' ? { senderWaId: candidate.senderWaId } : {}),
      ...(typeof candidate.displayName === 'string' ? { displayName: candidate.displayName } : {}),
      ...(typeof candidate.verifiedAt === 'string' ? { verifiedAt: candidate.verifiedAt } : {}),
    };
  });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const publicBaseUrl = env.PUBLIC_BASE_URL || undefined;
  const supabaseUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || undefined;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || undefined;
  const twilioAuthToken = env.TWILIO_AUTH_TOKEN || undefined;
  const twilioAccountSid = env.TWILIO_ACCOUNT_SID || undefined;
  const internalApiKey = env.INTERNAL_API_KEY || undefined;
  const sttProviderDefault = env.STT_PROVIDER_DEFAULT === 'google' ? 'google' : 'mock';
  const googleCloudProjectId = env.GOOGLE_CLOUD_PROJECT_ID || undefined;
  const googleCloudLocation = env.GOOGLE_CLOUD_LOCATION || undefined;
  const googleCloudStorageBucket = env.GOOGLE_CLOUD_STORAGE_BUCKET || undefined;
  const googleSpeechRecognizer = env.GOOGLE_SPEECH_RECOGNIZER || undefined;
  const googleServiceAccountJson = env.GOOGLE_SERVICE_ACCOUNT_JSON || undefined;
  const googleServiceAccountJsonPath = env.GOOGLE_SERVICE_ACCOUNT_JSON_PATH || undefined;

  return {
    port: Number.parseInt(env.PORT || '8890', 10),
    corsOrigin: env.CORS_ORIGIN || 'http://localhost:3000',
    skipTwilioSignatureValidation: parseBoolean(env.SKIP_TWILIO_SIGNATURE_VALIDATION, false),
    enableDebugState: parseBoolean(env.ENABLE_DEBUG_STATE, env.NODE_ENV !== 'production'),
    localArtifactRoot: env.LOCAL_ARTIFACT_ROOT || '.local/clinical-ai-orchestrator',
    ffmpegBinary: env.FFMPEG_BINARY || 'ffmpeg',
    ffprobeBinary: env.FFPROBE_BINARY || 'ffprobe',
    mediaFetchTimeoutMs: Number.parseInt(env.MEDIA_FETCH_TIMEOUT_MS || '60000', 10),
    sttProviderDefault,
    googleSpeechModel: env.GOOGLE_SPEECH_MODEL || 'long',
    doctorBindings: parseDoctorBindings(env.WHATSAPP_DOCTOR_BINDINGS_JSON),
    ...(publicBaseUrl ? { publicBaseUrl } : {}),
    ...(supabaseUrl ? { supabaseUrl } : {}),
    ...(supabaseServiceRoleKey ? { supabaseServiceRoleKey } : {}),
    ...(twilioAuthToken ? { twilioAuthToken } : {}),
    ...(twilioAccountSid ? { twilioAccountSid } : {}),
    ...(internalApiKey ? { internalApiKey } : {}),
    ...(googleCloudProjectId ? { googleCloudProjectId } : {}),
    ...(googleCloudLocation ? { googleCloudLocation } : {}),
    ...(googleCloudStorageBucket ? { googleCloudStorageBucket } : {}),
    ...(googleSpeechRecognizer ? { googleSpeechRecognizer } : {}),
    ...(googleServiceAccountJson ? { googleServiceAccountJson } : {}),
    ...(googleServiceAccountJsonPath ? { googleServiceAccountJsonPath } : {}),
  };
}
