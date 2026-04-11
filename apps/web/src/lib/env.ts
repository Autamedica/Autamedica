/**
 * Utilidades de entorno para apps/web (Astro).
 * Usa import.meta.env con fallback a getDomainConfig() para Cloudflare runtime.
 */

import { getDomainConfig } from '@autamedica/auth'

export type AppTarget = 'patients' | 'doctors' | 'pharmacy' | 'companies' | 'admin';

const APP_TO_DOMAIN_KEY: Record<AppTarget, keyof ReturnType<typeof getDomainConfig>['apps']> = {
  patients: 'patients',
  doctors: 'doctors',
  pharmacy: 'pharmacy',
  companies: 'companies',
  admin: 'admin',
} as const;

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
  const envKey = BASE_URL_ENV_KEYS[app];
  const value = import.meta.env[envKey];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  // Fallback: derive from domain config (works in Cloudflare runtime)
  const domainConfig = getDomainConfig();
  const domainKey = APP_TO_DOMAIN_KEY[app];
  return domainConfig.apps[domainKey];
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
