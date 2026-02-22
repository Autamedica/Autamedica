/**
 * Secure middleware for Doctors portal
 * Uses JWT verification instead of hardcoded credentials
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasRole, buildSafeLoginUrl, getTargetUrlByRole, isValidRole } from '@autamedica/shared';
import { logger } from '@autamedica/shared';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/_next',
  '/favicon.ico',
  '/public',
  '/api/health',
  '/manifest.webmanifest',
  '/auth/callback',
  '/consultation', // Allow direct access to video consultation
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(route => pathname === route || pathname.startsWith(`${route}/`));
}

// Allowed roles for doctors portal
const ALLOWED_ROLES = ['doctor', 'organization_admin', 'platform_admin'] as const;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { origin, search } = request.nextUrl;

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  try {
    // Get session using JWT verification (no Supabase client needed)
    // Cast needed due to monorepo Next type resolution mismatch between apps/packages.
    const session = await getSession(request as any);

    // No session - redirect to login
    if (!session) {
      const loginUrl = buildSafeLoginUrl('doctors', request.url, 'session_expired');
      return NextResponse.redirect(loginUrl);
    }

    // Check if user has allowed role for doctors portal
    if (!hasRole(session, [...ALLOWED_ROLES])) {
      // User has wrong role - redirect to their correct portal
      const role = session.user.role;
      if (!role || !isValidRole(role)) {
        const loginUrl = buildSafeLoginUrl('doctors', request.url, 'wrong_role');
        return NextResponse.redirect(loginUrl);
      }
      return NextResponse.redirect(getTargetUrlByRole(role));
    }

    // Verify user is on correct portal for their role
    const role = session.user.role;
    if (!role || !isValidRole(role)) {
      const loginUrl = buildSafeLoginUrl('doctors', request.url, 'wrong_role');
      return NextResponse.redirect(loginUrl);
    }

    const expectedOrigin = new URL(getTargetUrlByRole(role)).origin;
    if (origin !== expectedOrigin) {
      return NextResponse.redirect(new URL(`${pathname}${search}`, expectedOrigin));
    }

    // All checks passed
    return NextResponse.next();
  } catch (error) {
    logger.error('Middleware error:', error);

    // On error, redirect to login
    const loginUrl = buildSafeLoginUrl('doctors', request.url, 'auth_error');
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, manifest.webmanifest (metadata files)
     * - public folder
     * - api/health (health check endpoint)
     * - consultation pages (video calls)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|public|api/health|consultation).*)',
  ],
};
