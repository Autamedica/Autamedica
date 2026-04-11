/**
 * Utilidades de entorno para apps/web (Astro).
 * Usa import.meta.env en lugar de process-env.
 */

export type AppTarget = 'patients' | 'doctors' | 'pharmacy' | 'companies' | 'admin';

function readRequiredPublicEnv(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  throw new Error(`[env] Missing required environment variable: ${key}`);
}

const BASE_URL_ENV_KEYS: Record<AppTarget, keyof ImportMetaEnv> = {
  doctors: 'PUBLIC_DOCTORS_URL',
  patients: 'PUBLIC_PATIENTS_URL',
  pharmacy: 'PUBLIC_PHARMACY_URL',
  companies: 'PUBLIC_COMPANIES_URL',
  admin: 'PUBLIC_ADMIN_URL',
} as const;

const ROUTE_TO_APP: Array<[string, AppTarget]> = [
  ['/doctors', 'doctors'],
  ['/patients', 'patients'],
  ['/pharmacy', 'pharmacy'],
  ['/companies', 'companies']
];

function joinUrl(base: string, path: string): string {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return new URL(safePath, `${base.replace(/\/$/, '')}/`).toString();
}

export function getAppBaseUrl(app: AppTarget): string {
  return readRequiredPublicEnv(BASE_URL_ENV_KEYS[app]);
}

export function getAppUrl(path: string = '', app?: AppTarget): string {
  if (app) {
    return joinUrl(getAppBaseUrl(app), path);
  }

  for (const [route, target] of ROUTE_TO_APP) {
    if (path.startsWith(route)) {
      const portalPath = path.slice(route.length) || '/';
      return joinUrl(getAppBaseUrl(target), portalPath);
    }
  }

  return path;
}
