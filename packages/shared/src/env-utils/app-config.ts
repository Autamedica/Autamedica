import { ensureClientEnv, getClientEnvOrDefault, isDevelopment } from '../env';

export type AppName = 'patients' | 'doctors';

export interface AppEnvironmentConfig {
  nodeEnv: string;
  authHubOrigin: string;
  appOrigin: string;
  supabase: {
    url: string;
    anonKey: string;
  };
  signalingUrl: string;
  authDevBypassEnabled: boolean;
}

export interface LoginUrlBuilder {
  build(returnTo?: string): string;
}

function getAuthHubOrigin(): string {
  return isDevelopment()
    ? getClientEnvOrDefault('PUBLIC_APP_URL', 'http://localhost:3000')
    : getClientEnvOrDefault('PUBLIC_APP_URL', 'https://www.autamedica.com');
}

function getAppOrigins(): Record<AppName, string> {
  const devMode = isDevelopment();

  return {
    patients: devMode
      ? getClientEnvOrDefault('PUBLIC_PATIENTS_DEV_URL', 'http://localhost:3002')
      : getClientEnvOrDefault('PUBLIC_PATIENTS_URL', 'https://paciente.autamedica.com'),
    doctors: devMode
      ? getClientEnvOrDefault('PUBLIC_DOCTORS_DEV_URL', 'http://localhost:3001')
      : getClientEnvOrDefault('PUBLIC_DOCTORS_URL', 'https://doctor.autamedica.com'),
  };
}

export function getAppEnv(appName: AppName): AppEnvironmentConfig {
  const appOrigins = getAppOrigins();
  const authHubOrigin = getAuthHubOrigin();

  return {
    nodeEnv: isDevelopment() ? 'development' : 'production',
    authHubOrigin,
    appOrigin: appOrigins[appName],
    supabase: {
      url: ensureClientEnv('PUBLIC_SUPABASE_URL'),
      anonKey: ensureClientEnv('PUBLIC_SUPABASE_ANON_KEY'),
    },
    signalingUrl: getClientEnvOrDefault(
      'PUBLIC_SIGNALING_URL',
      'ws://localhost:8080',
    ),
    authDevBypassEnabled: getClientEnvOrDefault('PUBLIC_AUTH_DEV_BYPASS', 'false') === 'true',
  };
}

export function getLoginUrlBuilder(_appName: AppName): LoginUrlBuilder {
  const authHubOrigin = getAuthHubOrigin();

  return {
    build(returnTo?: string): string {
      const params = new URLSearchParams();
      if (returnTo) {
        params.set('returnTo', returnTo);
      }
      const query = params.toString();
      return query ? `${authHubOrigin}/auth/login/?${query}` : `${authHubOrigin}/auth/login/`;
    },
  };
}
