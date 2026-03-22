/**
 * Tests for middleware route-protection logic.
 *
 * The middleware exports `onRequest` which depends on Astro internals
 * (defineMiddleware, import.meta.env, context, etc.). Instead of trying
 * to spin up an Astro runtime, we extract and test the pure logic:
 *
 * - normalizePath
 * - isProtectedPath
 * - LEGACY_REDIRECTS mapping
 * - Route classification (public, auth, protected)
 */

import { describe, it, expect } from 'vitest';

// ---- Extracted from middleware.ts (pure functions) ----

const PROTECTED_ROUTES = [
  '/dashboard',
  '/profile',
  '/admin',
  '/settings',
  '/appointments',
  '/patients',
  '/doctors',
  '/companies',
];

const AUTH_ROUTES = ['/auth/login', '/auth/register'];

const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/contact',
  '/terms',
  '/privacy',
  '/privacidad',
  '/auth/callback',
  '/auth/select-role',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/api/health',
];

const ROLE_REDIRECTS: Record<string, string> = {
  patient: '/patients',
  doctor: '/doctors',
  company: '/companies',
  company_admin: '/companies',
  organization_admin: '/admin',
  platform_admin: '/admin',
  admin: '/admin',
};

const LEGACY_REDIRECTS: Record<string, string> = {
  '/app': '/platform',
  '/web-app': '/platform',
  '/webapp': '/platform',
  '/company': '/companies',
  '/empresa': '/companies',
  '/empresas': '/companies',
  '/patient': '/patients',
  '/paciente': '/patients',
  '/pacientes': '/patients',
  '/doctor': '/doctors',
  '/médico': '/doctors',
  '/médicos': '/doctors',
  '/doctores': '/doctors',
  '/portal/admin': '/admin',
  '/portals/admin': '/admin',
  '/portal/patients': '/patients',
  '/portal/pacientes': '/patients',
  '/portal/doctors': '/doctors',
  '/portal/médicos': '/doctors',
  '/portal/companies': '/companies',
  '/portal/empresas': '/companies',
  '/portals/patients': '/patients',
  '/portals/pacientes': '/patients',
  '/portals/doctors': '/doctors',
  '/portals/médicos': '/doctors',
  '/portals/companies': '/companies',
  '/portals/empresas': '/companies',
};

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function isProtectedPath(pathname: string): boolean {
  const normalizedPath = normalizePath(pathname);
  return PROTECTED_ROUTES.some((route) => {
    const normalizedRoute = normalizePath(route);
    return normalizedPath === normalizedRoute || normalizedPath.startsWith(`${normalizedRoute}/`);
  });
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some(route => pathname.startsWith(route));
}

function resolveLegacyRedirect(pathname: string): { target: string; rest: string } | null {
  for (const [legacy, target] of Object.entries(LEGACY_REDIRECTS)) {
    if (pathname === legacy) {
      return { target, rest: '' };
    }
    if (pathname.startsWith(`${legacy}/`)) {
      return { target, rest: pathname.slice(legacy.length) };
    }
  }
  return null;
}

// ---- Tests ----

describe('normalizePath', () => {
  it('strips trailing slash from multi-char paths', () => {
    expect(normalizePath('/dashboard/')).toBe('/dashboard');
  });

  it('does not strip the root slash', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('returns path unchanged when no trailing slash', () => {
    expect(normalizePath('/admin')).toBe('/admin');
  });

  it('handles deeply nested paths with trailing slash', () => {
    expect(normalizePath('/admin/users/list/')).toBe('/admin/users/list');
  });
});

describe('isProtectedPath', () => {
  it('marks /dashboard as protected', () => {
    expect(isProtectedPath('/dashboard')).toBe(true);
  });

  it('marks /dashboard/ (trailing slash) as protected', () => {
    expect(isProtectedPath('/dashboard/')).toBe(true);
  });

  it('marks /admin as protected', () => {
    expect(isProtectedPath('/admin')).toBe(true);
  });

  it('marks nested admin path /admin/users as protected', () => {
    expect(isProtectedPath('/admin/users')).toBe(true);
  });

  it('marks /patients as protected', () => {
    expect(isProtectedPath('/patients')).toBe(true);
  });

  it('marks /doctors/profile as protected', () => {
    expect(isProtectedPath('/doctors/profile')).toBe(true);
  });

  it('marks /companies as protected', () => {
    expect(isProtectedPath('/companies')).toBe(true);
  });

  it('marks /settings as protected', () => {
    expect(isProtectedPath('/settings')).toBe(true);
  });

  it('does not mark / as protected', () => {
    expect(isProtectedPath('/')).toBe(false);
  });

  it('does not mark /about as protected', () => {
    expect(isProtectedPath('/about')).toBe(false);
  });

  it('does not mark /auth/login as protected', () => {
    expect(isProtectedPath('/auth/login')).toBe(false);
  });

  it('does not mark /api/health as protected', () => {
    expect(isProtectedPath('/api/health')).toBe(false);
  });
});

describe('isPublicPath', () => {
  it('marks / as public', () => {
    expect(isPublicPath('/')).toBe(true);
  });

  it('marks /about as public', () => {
    expect(isPublicPath('/about')).toBe(true);
  });

  it('marks /auth/login as public', () => {
    expect(isPublicPath('/auth/login')).toBe(true);
  });

  it('marks /auth/callback as public', () => {
    expect(isPublicPath('/auth/callback')).toBe(true);
  });

  it('marks /auth/reset-password as public', () => {
    expect(isPublicPath('/auth/reset-password')).toBe(true);
  });

  it('marks /api/health as public', () => {
    expect(isPublicPath('/api/health')).toBe(true);
  });

  it('does not mark /dashboard as public', () => {
    expect(isPublicPath('/dashboard')).toBe(false);
  });

  it('does not mark /admin as public', () => {
    expect(isPublicPath('/admin')).toBe(false);
  });
});

describe('isAuthRoute', () => {
  it('marks /auth/login as auth route', () => {
    expect(isAuthRoute('/auth/login')).toBe(true);
  });

  it('marks /auth/register as auth route', () => {
    expect(isAuthRoute('/auth/register')).toBe(true);
  });

  it('does not mark /auth/callback as auth route', () => {
    expect(isAuthRoute('/auth/callback')).toBe(false);
  });

  it('does not mark /auth/select-role as auth route', () => {
    expect(isAuthRoute('/auth/select-role')).toBe(false);
  });

  it('does not mark /dashboard as auth route', () => {
    expect(isAuthRoute('/dashboard')).toBe(false);
  });
});

describe('ROLE_REDIRECTS', () => {
  it('redirects patient to /patients', () => {
    expect(ROLE_REDIRECTS['patient']).toBe('/patients');
  });

  it('redirects doctor to /doctors', () => {
    expect(ROLE_REDIRECTS['doctor']).toBe('/doctors');
  });

  it('redirects company to /companies', () => {
    expect(ROLE_REDIRECTS['company']).toBe('/companies');
  });

  it('redirects company_admin to /companies', () => {
    expect(ROLE_REDIRECTS['company_admin']).toBe('/companies');
  });

  it('redirects organization_admin to /admin', () => {
    expect(ROLE_REDIRECTS['organization_admin']).toBe('/admin');
  });

  it('redirects platform_admin to /admin', () => {
    expect(ROLE_REDIRECTS['platform_admin']).toBe('/admin');
  });

  it('returns undefined for unknown role', () => {
    expect(ROLE_REDIRECTS['unknown_role']).toBeUndefined();
  });
});

describe('resolveLegacyRedirect', () => {
  it('redirects /empresa to /companies (exact match)', () => {
    const result = resolveLegacyRedirect('/empresa');
    expect(result).toEqual({ target: '/companies', rest: '' });
  });

  it('redirects /empresa/dashboard to /companies with subpath', () => {
    const result = resolveLegacyRedirect('/empresa/dashboard');
    expect(result).toEqual({ target: '/companies', rest: '/dashboard' });
  });

  it('redirects /paciente to /patients', () => {
    const result = resolveLegacyRedirect('/paciente');
    expect(result).toEqual({ target: '/patients', rest: '' });
  });

  it('redirects /pacientes to /patients', () => {
    const result = resolveLegacyRedirect('/pacientes');
    expect(result).toEqual({ target: '/patients', rest: '' });
  });

  it('redirects /doctores to /doctors', () => {
    const result = resolveLegacyRedirect('/doctores');
    expect(result).toEqual({ target: '/doctors', rest: '' });
  });

  it('redirects /app to /platform', () => {
    const result = resolveLegacyRedirect('/app');
    expect(result).toEqual({ target: '/platform', rest: '' });
  });

  it('redirects /web-app to /platform', () => {
    const result = resolveLegacyRedirect('/web-app');
    expect(result).toEqual({ target: '/platform', rest: '' });
  });

  it('redirects /portal/admin to /admin', () => {
    const result = resolveLegacyRedirect('/portal/admin');
    expect(result).toEqual({ target: '/admin', rest: '' });
  });

  it('redirects /portal/doctors/123 to /doctors with subpath', () => {
    const result = resolveLegacyRedirect('/portal/doctors/123');
    expect(result).toEqual({ target: '/doctors', rest: '/123' });
  });

  it('returns null for non-legacy paths', () => {
    expect(resolveLegacyRedirect('/dashboard')).toBeNull();
    expect(resolveLegacyRedirect('/patients')).toBeNull();
    expect(resolveLegacyRedirect('/')).toBeNull();
  });
});
