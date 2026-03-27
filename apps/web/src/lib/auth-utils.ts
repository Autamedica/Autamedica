/**
 * Auth utilities for the web app.
 * Migrated from apps/auth/src/lib/cookies.ts
 */

const ALLOWED_LOCAL_PORTS = new Set(['3000', '3001', '3002', '3003', '3004', '3005']);

const ALLOWED_REDIRECT_HOSTS = new Set([
  'autamedica.com',
  'www.autamedica.com',
  'doctor.autamedica.com',
  'doctors.autamedica.com',
  'paciente.autamedica.com',
  'patients.autamedica.com',
  'empresa.autamedica.com',
  'companies.autamedica.com',
  'admin.autamedica.com',
  'autamedica-doctors.pages.dev',
  'autamedica-patients.pages.dev',
  'autamedica-companies.pages.dev',
  'autamedica-admin.pages.dev',
  'autamedica-web-app.pages.dev',
  'localhost',
  '127.0.0.1',
]);

function isAllowedByPattern(hostname: string): boolean {
  if (hostname.endsWith('.autamedica.com')) {
    return true;
  }
  return /^autamedica-[a-z0-9-]+\.pages\.dev$/i.test(hostname);
}

export function validateRedirectUrl(returnTo: string): boolean {
  try {
    const url = new URL(returnTo);
    if (!['https:', 'http:'].includes(url.protocol)) {
      return false;
    }

    if (!(ALLOWED_REDIRECT_HOSTS.has(url.hostname) || isAllowedByPattern(url.hostname))) {
      return false;
    }

    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return url.port === '' || ALLOWED_LOCAL_PORTS.has(url.port);
    }

    return true;
  } catch {
    return false;
  }
}

export function isProduction(): boolean {
  try {
    return import.meta.env.PROD === true;
  } catch {
    return false;
  }
}

export function getCanonicalAuthCallbackUrl(currentOrigin?: string): string {
  const authOrigin = isProduction()
    ? 'https://www.autamedica.com'
    : (currentOrigin ?? (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'));

  return new URL('/auth/callback', authOrigin).toString();
}
