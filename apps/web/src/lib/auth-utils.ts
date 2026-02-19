/**
 * Auth utilities for the web app.
 * Migrated from apps/auth/src/lib/cookies.ts
 */

const ALLOWED_REDIRECT_DOMAINS = [
  'autamedica.com',
  '*.autamedica.com',
  'localhost:3000',
  'localhost:3001',
  'localhost:3002',
  'localhost:3003',
  'localhost:3004',
  'localhost:3005',
];

export function validateRedirectUrl(returnTo: string): boolean {
  try {
    const url = new URL(returnTo);
    return ALLOWED_REDIRECT_DOMAINS.some(domain =>
      domain.startsWith('*')
        ? url.hostname.endsWith(domain.slice(2))
        : url.hostname === domain || url.hostname === domain.split(':')[0]
    );
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
