/**
 * Middleware de Astro para autenticación y protección de rutas.
 *
 * Reescritura del middleware Next.js al formato Astro (defineMiddleware).
 * La lógica de rutas protegidas, redirecciones y roles es idéntica al original.
 */

import { defineMiddleware } from 'astro:middleware';
import type { AstroCookieSetOptions } from 'astro';
import { createServerClient } from '@supabase/ssr';
import { logger } from '@autamedica/shared';

// Rutas que requieren autenticación
const PROTECTED_ROUTES = [
  '/dashboard',
  '/profile',
  '/admin',
  '/settings',
  '/appointments',
];

// Rutas de autenticación (redirigen si ya está autenticado)
const AUTH_ROUTES = ['/auth/login', '/auth/register'];

// Rutas públicas que no requieren verificación
const PUBLIC_ROUTES = [
  '/',
  '/about',
  '/contact',
  '/terms',
  '/privacy',
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
  '/medico': '/doctors',
  '/medicos': '/doctors',
  '/doctores': '/doctors',
  '/portal/admin': '/admin',
  '/portals/admin': '/admin',
  '/portal/patients': '/patients',
  '/portal/pacientes': '/patients',
  '/portal/doctors': '/doctors',
  '/portal/medicos': '/doctors',
  '/portal/companies': '/companies',
  '/portal/empresas': '/companies',
  '/portals/patients': '/patients',
  '/portals/pacientes': '/patients',
  '/portals/doctors': '/doctors',
  '/portals/medicos': '/doctors',
  '/portals/companies': '/companies',
  '/portals/empresas': '/companies',
};

const LEGACY_PREFIX_REDIRECTS: Record<string, string> = {
  '/empresa': '/companies',
  '/empresas': '/companies',
  '/patient': '/patients',
  '/paciente': '/patients',
  '/pacientes': '/patients',
  '/doctor': '/doctors',
  '/medico': '/doctors',
  '/medicos': '/doctors',
  '/doctores': '/doctors',
};

const PORTAL_BRIDGE_TARGETS = {
  '/patients': 'PUBLIC_PATIENTS_URL',
  '/doctors': 'PUBLIC_DOCTORS_URL',
  '/companies': 'PUBLIC_COMPANIES_URL',
  '/admin': 'PUBLIC_ADMIN_URL',
} as const;

const ASTRO_OWNED_ROUTES = new Set([
  '/patients',
  '/patients/appointments',
  '/patients/history',
  '/patients/prevention',
  '/doctors',
  '/doctors/agenda',
  '/doctors/consultations',
  '/doctors/patients',
  '/companies',
  '/companies/crisis',
  '/companies/marketplace',
  '/companies/reports',
]);

function normalizePath(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith('/')) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function parseExternalBase(value: string | undefined, fallback: string): URL {
  const raw = value?.trim() || fallback;
  try {
    return new URL(raw);
  } catch {
    return new URL(fallback);
  }
}

function buildExternalUrl(base: URL, pathname: string, search: string): string {
  const url = new URL(base.toString());
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  url.pathname = cleanPath === '/' ? '/' : cleanPath.replace(/\/{2,}/g, '/');
  url.search = search;
  return url.toString();
}

function resolveBridge(pathname: string): { prefix: keyof typeof PORTAL_BRIDGE_TARGETS; rest: string } | null {
  const prefixes = Object.keys(PORTAL_BRIDGE_TARGETS) as Array<keyof typeof PORTAL_BRIDGE_TARGETS>;

  for (const prefix of prefixes) {
    if (pathname === prefix || pathname === `${prefix}/`) {
      return { prefix, rest: '/' };
    }
    if (pathname.startsWith(`${prefix}/`)) {
      return { prefix, rest: pathname.slice(prefix.length) || '/' };
    }
  }

  return null;
}

function isProtectedPath(pathname: string): boolean {
  const normalizedPath = normalizePath(pathname);

  return PROTECTED_ROUTES.some((route) => {
    const normalizedRoute = normalizePath(route);

    if (normalizedPath === normalizedRoute) {
      return !ASTRO_OWNED_ROUTES.has(normalizedPath);
    }

    return normalizedPath.startsWith(`${normalizedRoute}/`);
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const requestUrl = new URL(context.request.url);
  const { pathname } = requestUrl;
  const normalizedPath = normalizePath(pathname);

  // SEO canonical host enforcement: autamedica.com -> www.autamedica.com
  if (import.meta.env.PROD && requestUrl.hostname === 'autamedica.com') {
    const canonicalUrl = new URL(requestUrl.toString());
    canonicalUrl.hostname = 'www.autamedica.com';
    return context.redirect(canonicalUrl.toString(), 308);
  }

  if (pathname.startsWith('/app/')) {
    const redirected = new URL(`/platform${pathname.slice('/app'.length)}`, context.request.url);
    redirected.search = requestUrl.search;
    return context.redirect(redirected.toString(), 301);
  }

  if (pathname.startsWith('/web-app/')) {
    const redirected = new URL(`/platform${pathname.slice('/web-app'.length)}`, context.request.url);
    redirected.search = requestUrl.search;
    return context.redirect(redirected.toString(), 301);
  }

  if (pathname.startsWith('/webapp/')) {
    const redirected = new URL(`/platform${pathname.slice('/webapp'.length)}`, context.request.url);
    redirected.search = requestUrl.search;
    return context.redirect(redirected.toString(), 301);
  }

  if (pathname.startsWith('/company/')) {
    const redirected = new URL(`/companies${pathname.slice('/company'.length)}`, context.request.url);
    redirected.search = requestUrl.search;
    return context.redirect(redirected.toString(), 301);
  }

  for (const [legacyPrefix, targetPrefix] of Object.entries(LEGACY_PREFIX_REDIRECTS)) {
    if (pathname.startsWith(`${legacyPrefix}/`)) {
      const redirected = new URL(`${targetPrefix}${pathname.slice(legacyPrefix.length)}`, context.request.url);
      redirected.search = requestUrl.search;
      return context.redirect(redirected.toString(), 301);
    }
  }

  const legacyTarget = LEGACY_REDIRECTS[pathname];
  if (legacyTarget) {
    const redirectUrl = new URL(legacyTarget, context.request.url);
    redirectUrl.search = requestUrl.search;
    return context.redirect(redirectUrl.toString(), 301);
  }

  // Saltear verificación para archivos estáticos y rutas públicas
  if (
    pathname.startsWith('/_astro/') ||
    pathname.includes('.') ||
    PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`))
  ) {
    return next();
  }

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
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              context.cookies.set(name, value, options as AstroCookieSetOptions);
            }
          }
        }
      }
    );

    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      logger.error('Middleware auth error:', error);

      const bridgeOnError = resolveBridge(pathname);
      if (bridgeOnError && !ASTRO_OWNED_ROUTES.has(normalizedPath)) {
        const loginUrl = new URL('/auth/login', context.request.url);
        loginUrl.searchParams.set('returnTo', pathname);
        loginUrl.searchParams.set('portal', bridgeOnError.prefix.slice(1));
        return context.redirect(loginUrl.toString());
      }

      if (isProtectedPath(pathname)) {
        const loginUrl = new URL('/auth/login', context.request.url);
        loginUrl.searchParams.set('returnTo', pathname);
        return context.redirect(loginUrl.toString());
      }

      return next();
    }

    context.locals.session = session;
    context.locals.supabase = supabase;

    const isAuthenticated = !!session;
    const isProtectedRoute = isProtectedPath(pathname);
    const isAuthRoute = AUTH_ROUTES.some(route => pathname.startsWith(route));
    const bridge = resolveBridge(pathname);

    // Redirigir usuarios autenticados que intentan acceder a páginas de auth
    if (isAuthenticated && isAuthRoute) {
      const userRole = session.user.user_metadata?.role as string | undefined;

      if (!userRole) {
        return context.redirect('/auth/select-role');
      }

      return context.redirect(ROLE_REDIRECTS[userRole] ?? '/');
    }

    // Bridge temporal de convivencia: rutas legacy continúan en apps Next.
    if (bridge) {
      if (!ASTRO_OWNED_ROUTES.has(normalizedPath)) {
        if (!isAuthenticated) {
          const loginUrl = new URL('/auth/login', context.request.url);
          loginUrl.searchParams.set('returnTo', pathname);
          const portal = bridge.prefix.slice(1);
          loginUrl.searchParams.set('portal', portal);
          return context.redirect(loginUrl.toString());
        }

        const envKey = PORTAL_BRIDGE_TARGETS[bridge.prefix];
        const externalBase = parseExternalBase(import.meta.env[envKey], `https://${bridge.prefix.slice(1)}.autamedica.com`);
        const targetUrl = buildExternalUrl(externalBase, bridge.rest, requestUrl.search);
        return context.redirect(targetUrl, 307);
      }
    }

    // Redirigir usuarios no autenticados que intentan acceder a rutas protegidas
    if (!isAuthenticated && isProtectedRoute) {
      let portal = 'patients';
      if (pathname.startsWith('/doctors')) portal = 'doctors';
      else if (pathname.startsWith('/companies')) portal = 'companies';
      else if (pathname.startsWith('/admin')) portal = 'admin';

      const loginUrl = new URL('/auth/login', context.request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      loginUrl.searchParams.set('portal', portal);

      return context.redirect(loginUrl.toString());
    }

    // Verificar acceso por rol para rutas específicas
    if (isAuthenticated && isProtectedRoute) {
      const userRole = session.user.user_metadata?.role as string | undefined;

      if (!userRole) {
        return context.redirect('/auth/select-role');
      }

      if (pathname.startsWith('/admin') && !['organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect('/');
      }

      if (pathname.startsWith('/doctors') && !['doctor', 'organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect('/');
      }

      if (pathname.startsWith('/companies') && !['company', 'company_admin', 'organization_admin', 'platform_admin', 'admin'].includes(userRole)) {
        return context.redirect('/');
      }
    }

    return next();

  } catch (err) {
    logger.error('Middleware error:', err);

    if (isProtectedPath(pathname)) {
      const loginUrl = new URL('/auth/login', context.request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return context.redirect(loginUrl.toString());
    }

    return next();
  }
});
