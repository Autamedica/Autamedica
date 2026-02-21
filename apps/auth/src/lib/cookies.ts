import { isProduction } from '@autamedica/shared';

export const sessionCookieOptions = {
  name: 'am_session',
  domain: '.autamedica.com',
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  maxAge: 60 * 60 * 8, // 8 hours
};

export const PORTAL_MAPPING = {
  doctors: 'https://doctors.autamedica.com',
  patients: 'https://patients.autamedica.com',
  companies: 'https://companies.autamedica.com',
  admin: 'https://admin.autamedica.com'
} as const;

export const ALLOWED_PORTALS = new Set(Object.keys(PORTAL_MAPPING));

const ALLOWED_LOCAL_PORTS = new Set(['3000', '3001', '3002', '3003', '3004', '3005']);

const ALLOWED_REDIRECT_HOSTS = new Set([
  'autamedica.com',
  'www.autamedica.com',
  'doctors.autamedica.com',
  'patients.autamedica.com',
  'companies.autamedica.com',
  'admin.autamedica.com',
  'localhost',
  '127.0.0.1',
]);

function isAllowedByPattern(hostname: string): boolean {
  if (hostname.endsWith('.autamedica.com')) return true;
  if (isProduction()) return false;
  return /^autamedica-[a-z0-9-]+\.pages\.dev$/i.test(hostname);
}

export function validateRedirectUrl(returnTo: string): boolean {
  try {
    const url = new URL(returnTo);
    if (!['https:', 'http:'].includes(url.protocol)) {
      return false;
    }

    if (ALLOWED_REDIRECT_HOSTS.has(url.hostname) || isAllowedByPattern(url.hostname)) {
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return url.port === '' || ALLOWED_LOCAL_PORTS.has(url.port);
      }
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

export function resolvePortalUrl(portal?: string, returnTo?: string): string {
  // 1. Validate returnTo if present
  if (returnTo && validateRedirectUrl(returnTo)) {
    return returnTo;
  }

  // 2. Resolve valid portal
  const validPortal = portal && ALLOWED_PORTALS.has(portal) ? portal : 'patients';
  return PORTAL_MAPPING[validPortal as keyof typeof PORTAL_MAPPING];
}
