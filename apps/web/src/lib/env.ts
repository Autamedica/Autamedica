/**
 * Utilidades de entorno para apps/web (Astro).
 * Usa import.meta.env en lugar de process-env.
 */

export type AppTarget = 'patients' | 'doctors' | 'companies' | 'admin';

function readPublicEnv(key: keyof ImportMetaEnv, fallback: string): string {
  const value = import.meta.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

const BASE_URLS: Record<AppTarget, string> = {
  doctors: readPublicEnv('PUBLIC_DOCTORS_URL', 'https://doctors.autamedica.com'),
  patients: readPublicEnv('PUBLIC_PATIENTS_URL', 'https://patients.autamedica.com'),
  companies: readPublicEnv('PUBLIC_COMPANIES_URL', 'https://companies.autamedica.com'),
  admin: readPublicEnv('PUBLIC_ADMIN_URL', 'https://admin.autamedica.com'),
} as const;

const ROUTE_TO_APP: Array<[string, AppTarget]> = [
  ['/doctors', 'doctors'],
  ['/patients', 'patients'],
  ['/companies', 'companies']
];

function joinUrl(base: string, path: string): string {
  const safePath = path.startsWith('/') ? path : `/${path}`;
  return new URL(safePath, `${base.replace(/\/$/, '')}/`).toString();
}

export function getAppBaseUrl(app: AppTarget): string {
  return BASE_URLS[app];
}

export function getAppUrl(path: string = '', app?: AppTarget): string {
  if (app) {
    return joinUrl(BASE_URLS[app], path);
  }

  for (const [route, target] of ROUTE_TO_APP) {
    if (path.startsWith(route)) {
      const portalPath = path.slice(route.length) || '/';
      return joinUrl(BASE_URLS[target], portalPath);
    }
  }

  return path;
}
