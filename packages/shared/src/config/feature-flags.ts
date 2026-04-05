/**
 * Feature Flags Configuration
 *
 * Controla qué features están activas en cada ambiente.
 * Usa variables de entorno para configurar mocks vs servicios reales.
 *
 * Compatible con browser (import.meta.env) y server (process.env).
 *
 * @module feature-flags
 */

import { logger } from '../services/logger.service';

function getEnv(key: string): string | undefined {
  // Astro/Vite browser: import.meta.env
  try {
    const meta = import.meta as unknown as { env?: Record<string, string> };
    if (meta.env) return meta.env[key];
  } catch { /* not available */ }
  // Node/server
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
}

function envIs(key: string, value: string): boolean {
  return getEnv(key) === value;
}

function envExists(key: string): boolean {
  const v = getEnv(key);
  return v !== undefined && v !== '';
}

/**
 * Feature flags basados en variables de entorno.
 * Getter-based para evaluación lazy (compatible con browser y server).
 */
export const featureFlags = {
  // Video/Telemedicine
  get USE_MOCK_VIDEO() { return envIs('PUBLIC_USE_MOCK_VIDEO', 'true'); },
  get USE_LIVEKIT() { return envIs('PUBLIC_USE_LIVEKIT', 'true'); },

  // Medical Data
  get USE_MOCK_MEDICAL_DATA() { return envIs('PUBLIC_USE_MOCK_MEDICAL_DATA', 'true'); },

  // AI Services
  get USE_MOCK_AI() { return envIs('PUBLIC_USE_MOCK_AI', 'true'); },
  get AI_PROVIDER(): 'anthropic' | 'google' | 'auto' {
    return (getEnv('PUBLIC_AI_PROVIDER') || 'auto') as 'anthropic' | 'google' | 'auto';
  },
  get USE_ANTHROPIC_AI() { return envExists('ANTHROPIC_API_KEY'); },
  get USE_GOOGLE_AI() { return envExists('GOOGLE_AI_API_KEY'); },
  get USE_REAL_AI() { return envExists('ANTHROPIC_API_KEY') || envExists('GOOGLE_AI_API_KEY'); },

  // Environment Detection
  get IS_PRODUCTION() { return envIs('NODE_ENV', 'production'); },
  get IS_DEVELOPMENT() { return envIs('NODE_ENV', 'development') || envIs('PUBLIC_ENV', 'development'); },
  get IS_STAGING() { return envIs('PUBLIC_ENV', 'staging'); },
  get IS_TESTING() { return envIs('NODE_ENV', 'test') || envIs('MOCK_AUTAMEDICA', '1'); },
} as const;

export type FeatureFlags = typeof featureFlags;

export function isMockMode(): boolean {
  return featureFlags.USE_MOCK_VIDEO ||
         featureFlags.USE_MOCK_MEDICAL_DATA ||
         featureFlags.USE_MOCK_AI;
}

export function isProductionMode(): boolean {
  return featureFlags.IS_PRODUCTION && !isMockMode();
}

export function getAIProvider(): 'anthropic' | 'google' | null {
  if (featureFlags.USE_MOCK_AI) return null;
  if (featureFlags.AI_PROVIDER !== 'auto') return featureFlags.AI_PROVIDER;
  if (featureFlags.USE_ANTHROPIC_AI) return 'anthropic';
  if (featureFlags.USE_GOOGLE_AI) return 'google';
  return null;
}

export function validateFeatureFlags(): void {
  const warnings: string[] = [];

  if (featureFlags.IS_PRODUCTION && isMockMode()) {
    warnings.push('WARNING: Mocks activos en PRODUCCION');
  }
  if (!featureFlags.USE_MOCK_VIDEO && !featureFlags.USE_LIVEKIT) {
    warnings.push('WARNING: Video real requiere LiveKit (USE_LIVEKIT=true)');
  }
  if (!featureFlags.USE_MOCK_AI && !featureFlags.USE_REAL_AI) {
    warnings.push('WARNING: AI real requiere ANTHROPIC_API_KEY o GOOGLE_AI_API_KEY');
  }

  if (warnings.length > 0 && !featureFlags.IS_PRODUCTION) {
    warnings.forEach(w => logger.warn(w));
  }

  if (featureFlags.IS_PRODUCTION && isMockMode()) {
    throw new Error('FATAL: Mocks cannot be active in production environment.');
  }
}

export function logFeatureFlags(): void {
  if (featureFlags.IS_PRODUCTION) return;
  logger.info('Feature Flags:', {
    mocks: { video: featureFlags.USE_MOCK_VIDEO, medical: featureFlags.USE_MOCK_MEDICAL_DATA, ai: featureFlags.USE_MOCK_AI },
    services: { livekit: featureFlags.USE_LIVEKIT, aiProvider: getAIProvider() },
    env: { production: featureFlags.IS_PRODUCTION, staging: featureFlags.IS_STAGING, dev: featureFlags.IS_DEVELOPMENT },
  });
}
