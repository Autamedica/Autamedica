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

const ROLE_REDIRECTS: Record<string, string> = {
  patient: 'https://paciente.autamedica.com',
  doctor: 'https://doctor.autamedica.com',
  company: 'https://empresa.autamedica.com',
  company_admin: 'https://empresa.autamedica.com',
  organization_admin: 'https://admin.autamedica.com',
  platform_admin: 'https://admin.autamedica.com',
  admin: 'https://admin.autamedica.com',
};

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
  if (url.hostname === 'doctor.autamedica.com') return 'doctor';
  if (url.hostname === 'paciente.autamedica.com') return 'patient';
  if (url.hostname === 'empresa.autamedica.com') return 'company';
  return null;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const requestUrl = new URL(context.request.url);
  const { pathname } = requestUrl;
  const portal = detectPortal(requestUrl);
  const isDoctorHost = portal === 'doctor';
  const isPatientHost = portal === 'patient';
  const isCompanyHost = portal === 'company';
  const isDoctorHostRoot = isDoctorHost && pathname === '/';
  const isPatientHostRoot = isPatientHost && pathname === '/';
  const isPortalHostRoot = isDoctorHostRoot || isPatientHostRoot;

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
    const supabase = createServerClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
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
      logger.error('Middleware auth error:', error);
      // Clear invalid session cookies so the browser stops sending them and
      // the browser-side Supabase client stops entering an infinite refresh loop.
      // signOut({ scope: 'local' }) calls setAll() with max-age=0 cookies in the
      // response — no network call to Supabase required.
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Ignore cleanup errors
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
        return context.redirect(ROLE_REDIRECTS[userRole] ?? '/auth/select-role');
      }
      // Not authenticated — show login/register form
      return next();
    }

    // Protected routes: redirect unauthenticated users to login
    const isProtectedRoute = isProtectedPath(pathname) || isPortalHostRoot;
    const isDevMode = !import.meta.env.PROD;

    if (!isAuthenticated && isProtectedRoute) {
      if (isDevMode) {
        logger.warn(`[MODODEV] Bypass activado para: ${pathname}`);
        return next();
      }

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

      // Permite acceso sin rol en modo dev (evita redirect loops)
      if (isDevMode && !userRole) {
        return next();
      }

      if (!userRole) {
        return context.redirect('/auth/select-role');
      }

      if (pathname.startsWith('/admin') && !['organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect(ROLE_REDIRECTS[userRole] ?? '/auth/select-role');
      }

      if ((isDoctorHostRoot || pathname.startsWith('/doctors')) && !['doctor', 'organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect(ROLE_REDIRECTS[userRole] ?? '/auth/select-role');
      }

      if ((isPatientHostRoot || pathname.startsWith('/patients')) && !['patient', 'organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect(ROLE_REDIRECTS[userRole] ?? '/auth/select-role');
      }

      if (pathname.startsWith('/companies') && !['company', 'company_admin', 'organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect(ROLE_REDIRECTS[userRole] ?? '/auth/select-role');
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
