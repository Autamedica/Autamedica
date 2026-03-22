/**
 * Middleware de Astro para autenticación y protección de rutas.
 *
 * Reescritura del middleware Next.js al formato Astro (defineMiddleware).
 * La lógica de rutas protegidas, redirecciones y roles es idéntica al original.
 */

import { logger } from '@autamedica/shared';
import { createServerClient } from '@supabase/ssr';
import type { AstroCookieSetOptions } from 'astro';
import { defineMiddleware } from 'astro:middleware';

// Rutas que requieren autenticación
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

// Rutas de autenticación (redirigen si ya está autenticado)
const AUTH_ROUTES = ['/auth/login', '/auth/register'];

// Rutas públicas que no requieren verificación
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

export const onRequest = defineMiddleware(async (context, next) => {
  const requestUrl = new URL(context.request.url);
  const { pathname } = requestUrl;

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

  // Interceptar redirects de OAuth o Magic Links que caen fuera del callback
  if (pathname !== '/auth/callback' && requestUrl.searchParams.has('code')) {
    const callbackUrl = new URL('/auth/callback', context.request.url);
    callbackUrl.search = requestUrl.search;
    return context.redirect(callbackUrl.toString(), 302);
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

    // Redirigir usuarios autenticados que intentan acceder a páginas de auth
    if (isAuthenticated && isAuthRoute) {
      const userRole = session.user.user_metadata?.role as string | undefined;

      if (!userRole) {
        return context.redirect('/auth/select-role');
      }

      return context.redirect(ROLE_REDIRECTS[userRole] ?? '/');
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
