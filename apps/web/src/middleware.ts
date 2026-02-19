/**
 * Middleware de Astro para autenticación y protección de rutas.
 *
 * Reescritura del middleware Next.js al formato Astro (defineMiddleware).
 * La lógica de rutas protegidas, redirecciones y roles es idéntica al original.
 */

import { defineMiddleware } from 'astro:middleware';
import { createServerClient } from '@supabase/ssr';
import { logger } from '@autamedica/shared';

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
  '/auth/callback',
  '/auth/select-role',
  '/auth/login',
  '/auth/register',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/api/health',
];

const ROLE_REDIRECTS: Record<string, string> = {
  patient: '/dashboard',
  doctor: '/doctor/dashboard',
  company: '/company/dashboard',
  admin: '/admin/dashboard',
};

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = new URL(context.request.url);

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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              context.cookies.set(name, value, options as any);
            }
          }
        }
      }
    );

    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
      logger.error('Middleware auth error:', error);
      return next();
    }

    context.locals.session = session;
    context.locals.supabase = supabase;

    const isAuthenticated = !!session;
    const isProtectedRoute = PROTECTED_ROUTES.some(route => pathname.startsWith(route));
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

      if (pathname.startsWith('/admin') && userRole !== 'admin') {
        return context.redirect('/');
      }

      if (pathname.startsWith('/doctor') && !['doctor', 'admin'].includes(userRole)) {
        return context.redirect('/');
      }

      if (pathname.startsWith('/company') && !['company', 'admin'].includes(userRole)) {
        return context.redirect('/');
      }
    }

    return next();

  } catch (err) {
    logger.error('Middleware error:', err);

    if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
      const loginUrl = new URL('/auth/login', context.request.url);
      loginUrl.searchParams.set('returnTo', pathname);
      return context.redirect(loginUrl.toString());
    }

    return next();
  }
});
