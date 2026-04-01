/**
 * Middleware de Astro para autenticación y protección de rutas.
 *
 * Security: Uses getUser() for server-side JWT verification.
 * Auth routes are checked BEFORE public routes to prevent authenticated users
 * from seeing login/register forms.
 */

import { logger } from '@autamedica/shared';
import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import type { AstroCookieSetOptions } from 'astro';
import { defineMiddleware } from 'astro:middleware';
import { detectLocale, LOCALE_COOKIE } from './i18n/index';
import { isProduction } from './lib/auth-utils';
import { primeRuntimeEnv, resolvePublicSupabaseEnv } from './lib/runtime-env';

// Rutas que requieren autenticación
const PROTECTED_ROUTES = [
  '/profile',
  '/admin',
  '/settings',
  '/appointments',
  '/patients',
  '/doctors',
  '/companies',
];

// Rutas de autenticación (redirigen si ya está autenticado)
const AUTH_ROUTES = ['/auth/login', '/auth/register'];

// Rutas públicas que no requieren verificación
// NOTE: /auth/login and /auth/register are NOT here — they're handled by AUTH_ROUTES
// to ensure authenticated users get redirected to their dashboard.
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/contact',
  '/terms',
  '/privacy',
  '/privacidad',
  '/auth/callback',
  '/auth/select-role',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/api/health',
];

/** Role → redirect URL. Prod uses subdomains, dev uses ?portal= query param. */
function getRoleRedirect(role: string): string {
  if (import.meta.env.PROD) {
    const PROD: Record<string, string> = {
      patient: 'https://paciente.autamedica.com',
      doctor: 'https://doctor.autamedica.com',
      company: 'https://empresa.autamedica.com',
      company_admin: 'https://empresa.autamedica.com',
      organization_admin: 'https://admin.autamedica.com',
      platform_admin: 'https://admin.autamedica.com',
      admin: 'https://admin.autamedica.com',
    };
    return PROD[role] ?? '/auth/select-role';
  }
  const DEV_PORTALS: Record<string, string> = {
    patient: 'patient', doctor: 'doctor', company: 'company',
    company_admin: 'company', admin: 'admin',
    organization_admin: 'admin', platform_admin: 'admin',
  };
  const portal = DEV_PORTALS[role];
  return portal ? `/?portal=${portal}` : '/auth/select-role';
}

// Unified legacy redirects: handles both exact match (/empresa → /companies)
// and prefix+subpath (/empresa/foo → /companies/foo) in a single loop.
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

/** Type-safe role extraction from user metadata */
function extractRole(metadata: Record<string, unknown> | undefined): string | undefined {
  const raw = metadata?.role;
  return typeof raw === 'string' ? raw : undefined;
}

/** Detect portal from hostname (prod) or ?portal= query param (dev) */
function detectPortal(url: URL): string | null {
  // Dev override: ?portal=doctor|patient|company
  if (!import.meta.env.PROD && url.searchParams.has('portal')) {
    return url.searchParams.get('portal');
  }
  if (url.hostname === 'doctor.autamedica.com' || url.hostname === 'doctors.autamedica.com') {
    return 'doctor';
  }
  if (url.hostname === 'paciente.autamedica.com' || url.hostname === 'patients.autamedica.com') {
    return 'patient';
  }
  if (url.hostname === 'empresa.autamedica.com' || url.hostname === 'companies.autamedica.com') {
    return 'company';
  }
  return null;
}

function getAuthCookieDebug(request: Request): { hasAuthCookies: boolean; authCookieNames: string[] } {
  const rawCookieHeader = request.headers.get('cookie') ?? '';
  const authCookieNames = rawCookieHeader
    .split('; ')
    .map((entry) => entry.split('=')[0])
    .filter((name) => name.startsWith('sb-'));

  return {
    hasAuthCookies: authCookieNames.length > 0,
    authCookieNames,
  };
}

export const onRequest = defineMiddleware(async (context, next) => {
  primeRuntimeEnv(context.locals.runtime?.env);

  const requestUrl = new URL(context.request.url);
  const { pathname } = requestUrl;
  const portal = detectPortal(requestUrl);
  const authCookieDebug = getAuthCookieDebug(context.request);
  const isDoctorHost = portal === 'doctor';
  const isPatientHost = portal === 'patient';
  const isCompanyHost = portal === 'company';
  const isDoctorHostRoot = isDoctorHost && pathname === '/';
  const isPatientHostRoot = isPatientHost && pathname === '/';
  const isCompanyHostRoot = isCompanyHost && pathname === '/';
  const isPortalHostRoot = isDoctorHostRoot || isPatientHostRoot || isCompanyHostRoot;

  // Doctor portal: normalize dashboard paths to /
  if (isDoctorHost && !pathname.startsWith('/_astro/') && !pathname.includes('.')) {
    if (pathname === '/dashboard' || pathname === '/doctors' || pathname === '/doctors/dashboard') {
      const doctorRootUrl = new URL('/', requestUrl);
      doctorRootUrl.search = requestUrl.search;
      return context.redirect(doctorRootUrl.toString(), 302);
    }
  }

  // Patient portal: normalize dashboard paths to /
  if (isPatientHost && !pathname.startsWith('/_astro/') && !pathname.includes('.')) {
    if (pathname === '/dashboard' || pathname === '/patients' || pathname === '/patients/dashboard') {
      const patientRootUrl = new URL('/', requestUrl);
      patientRootUrl.search = requestUrl.search;
      return context.redirect(patientRootUrl.toString(), 302);
    }
  }

  // SEO canonical host enforcement: redirect legacy/bare domains to www.autamedica.com
  if (import.meta.env.PROD && (requestUrl.hostname === 'autamedica.com' || requestUrl.hostname === 'autamedica-web.pages.dev')) {
    const canonicalUrl = new URL(requestUrl.toString());
    canonicalUrl.hostname = 'www.autamedica.com';
    return context.redirect(canonicalUrl.toString(), 308);
  }

  // Unified legacy redirect: exact match + prefix+subpath in one pass
  for (const [legacy, target] of Object.entries(LEGACY_REDIRECTS)) {
    if (pathname === legacy) {
      const redirectUrl = new URL(target, context.request.url);
      redirectUrl.search = requestUrl.search;
      return context.redirect(redirectUrl.toString(), 301);
    }
    if (pathname.startsWith(`${legacy}/`)) {
      const rest = pathname.slice(legacy.length);
      const redirected = new URL(`${target}${rest}`, context.request.url);
      redirected.search = requestUrl.search;
      return context.redirect(redirected.toString(), 301);
    }
  }

  // Intercept OAuth redirects that land outside /auth/callback
  // Require both `code` and `state` params (OAuth standard) to avoid false positives
  if (pathname !== '/auth/callback' && requestUrl.searchParams.has('code') && requestUrl.searchParams.has('state')) {
    const callbackUrl = new URL('/auth/callback', context.request.url);
    callbackUrl.search = requestUrl.search;
    return context.redirect(callbackUrl.toString(), 302);
  }

  // Skip auth for static assets
  if (pathname.startsWith('/_astro/') || pathname.includes('.')) {
    return next();
  }

  // ── LOCALE DETECTION ────────────────────────────────────────────────────────
  // Prioridad: cookie au-locale > CF-IPCountry (Cloudflare) > Accept-Language > 'es'
  {
    const rawCookies = context.request.headers.get('cookie');
    const cfIpCountry = context.request.headers.get('CF-IPCountry');
    const acceptLanguage = context.request.headers.get('Accept-Language');

    const locale = detectLocale(rawCookies, cfIpCountry, acceptLanguage);
    context.locals.locale = locale;

    // Persistir en cookie solo si no coincide (evita escribir en cada request)
    const savedLocale = rawCookies?.match(/au-locale=([^;]+)/)?.[1]?.trim();
    if (savedLocale !== locale) {
      context.cookies.set(LOCALE_COOKIE, locale, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365, // 1 año
        sameSite: 'lax',
        secure: import.meta.env.PROD,
        httpOnly: false, // legible por LanguageSwitcher en el cliente
      } as AstroCookieSetOptions);
    }
  }
  // ── FIN LOCALE DETECTION ────────────────────────────────────────────────────

  // Check if this is an auth route (login/register) — these need special handling
  const isAuthRoute = AUTH_ROUTES.some(route => pathname === route);

  // Public routes that are NOT auth routes — skip auth entirely
  if (!isAuthRoute && !isPortalHostRoot && PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))) {
    return next();
  }

  // Everything below requires auth verification
  try {
    const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(
      context.locals.runtime?.env,
    );

    if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
      throw new Error(
        `[middleware] Missing env: PUBLIC_SUPABASE_URL=${!!publicSupabaseUrl}, ` +
          `PUBLIC_SUPABASE_ANON_KEY=${!!publicSupabaseAnonKey}.`,
      );
    }

    const supabase = createServerClient(
      publicSupabaseUrl,
      publicSupabaseAnonKey,
      {
        cookies: {
          getAll() {
            const cookieHeader = context.request.headers.get('cookie') ?? '';
            if (!cookieHeader) return [];
            return cookieHeader.split('; ').map(c => {
              const eq = c.indexOf('=');
              return {
                name: eq >= 0 ? c.slice(0, eq) : c,
                value: eq >= 0 ? c.slice(eq + 1) : ''
              };
            });
          },
          setAll(cookiesToSet: Parameters<NonNullable<CookieMethodsServer['setAll']>>[0]) {
            const domainOverride = isProduction() ? '.autamedica.com' : undefined;
            for (const { name, value, options } of cookiesToSet) {
              context.cookies.set(name, value, {
                ...options,
                domain: domainOverride,
                path: '/',
              } as AstroCookieSetOptions);
            }
          }
        }
      }
    );

    // Server-side verification: getUser() validates JWT against Supabase server
    // (unlike getSession() which only reads local cookie data without verification)
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error) {
      // Rate-limit or transient server errors: do NOT clear cookies — the session
      // may still be valid. Only clear on definitive auth failures (invalid JWT, etc.).
      const isTransient = /rate.limit|too.many|429|5\d\d/i.test(error.message ?? '');
      if (isTransient) {
        logger.warn('Middleware auth: transient error, preserving session cookies', {
          msg: error.message,
          pathname,
          portal,
          ...authCookieDebug,
        });
      } else {
        logger.error('Middleware auth error, clearing session:', {
          pathname,
          portal,
          ...authCookieDebug,
          error,
        });
        try {
          await supabase.auth.signOut({ scope: 'local' });
        } catch {
          // Ignore cleanup errors
        }
      }
    }

    // Get session for locals (only trust it if getUser succeeded)
    const { data: { session } } = await supabase.auth.getSession();
    context.locals.session = user ? session : null;
    context.locals.supabase = supabase;

    const isAuthenticated = !!user;

    // Auth routes: redirect authenticated users to their dashboard
    if (isAuthRoute) {
      if (isAuthenticated) {
        const userRole = extractRole(user.user_metadata as Record<string, unknown>);
        if (!userRole) {
          return context.redirect('/auth/select-role');
        }
        return context.redirect(getRoleRedirect(userRole));
      }
      // Not authenticated — show login/register form
      return next();
    }

    // Protected routes: redirect unauthenticated users to login
    const isProtectedRoute = isProtectedPath(pathname) || isPortalHostRoot;
    const AUTH_BYPASS_ENABLED = import.meta.env.AUTH_BYPASS === 'true';

    if (!isAuthenticated && isProtectedRoute) {
      if (AUTH_BYPASS_ENABLED) {
        logger.warn('[AUTH_BYPASS] Bypass enabled for protected route without valid session', {
          pathname,
          portal,
          ...authCookieDebug,
        });
        return next();
      }

      logger.info('Middleware auth: redirecting unauthenticated request to login', {
        pathname,
        portal,
        ...authCookieDebug,
      });

      let loginPortal = 'patients';
      if (isDoctorHostRoot || pathname.startsWith('/doctors')) loginPortal = 'doctors';
      else if (isCompanyHost || pathname.startsWith('/companies')) loginPortal = 'companies';
      else if (pathname.startsWith('/admin')) loginPortal = 'admin';

      const loginUrl = new URL('/auth/login', context.request.url);
      loginUrl.searchParams.set('returnTo', isPortalHostRoot ? '/' : pathname);
      loginUrl.searchParams.set('portal', loginPortal);

      return context.redirect(loginUrl.toString());
    }

    // Role-based access control for protected routes
    if (isAuthenticated && isProtectedRoute) {
      const userRole = extractRole(user.user_metadata as Record<string, unknown>);

      if (!userRole) {
        return context.redirect('/auth/select-role');
      }

      if (pathname.startsWith('/admin') && !['organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect(getRoleRedirect(userRole));
      }

      if ((isDoctorHostRoot || pathname.startsWith('/doctors')) && !['doctor', 'organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect(getRoleRedirect(userRole));
      }

      if ((isPatientHostRoot || pathname.startsWith('/patients')) && !['patient', 'organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect(getRoleRedirect(userRole));
      }

      if ((isCompanyHostRoot || pathname.startsWith('/companies')) && !['company', 'company_admin', 'organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect(getRoleRedirect(userRole));
      }
    }

    return next();

  } catch (err) {
    logger.error('Middleware error:', err);

    if (isProtectedPath(pathname) || isPortalHostRoot) {
      const loginUrl = new URL('/auth/login', context.request.url);
      loginUrl.searchParams.set('returnTo', isPortalHostRoot ? '/' : pathname);
      return context.redirect(loginUrl.toString());
    }

    return next();
  }
});
