/**
 * Secure middleware for Patients portal
 * Uses JWT verification via @autamedica/shared
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasRole, buildSafeLoginUrl } from '@autamedica/shared';
import { logger } from '@autamedica/shared';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/_next',
  '/favicon.ico',
  '/public',
  '/api/health',
  '/manifest.webmanifest',
  '/auth/callback',
  '/consultation',
  '/call',
];

// Allowed roles for patients portal
const ALLOWED_ROLES = ['patient', 'organization_admin', 'platform_admin'] as const;

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  try {
    // Get session using JWT verification (no Supabase client needed)
    // Cast needed due to monorepo React version mismatch between apps
    const session = await getSession(request as any);

    // No session - redirect to login
    if (!session) {
      const loginUrl = buildSafeLoginUrl('patients', request.url, 'session_expired');
      return NextResponse.redirect(loginUrl);
    }

    // Check if user has allowed role for patients portal
    if (!hasRole(session, [...ALLOWED_ROLES])) {
      // User has wrong role - redirect to auth hub to select correct portal
      const loginUrl = buildSafeLoginUrl('patients', undefined, 'wrong_role');
      return NextResponse.redirect(loginUrl);
    }

    // All checks passed
    return NextResponse.next();
  } catch (error) {
    logger.error('Patients middleware error:', error);

    // On error, redirect to login
    const loginUrl = buildSafeLoginUrl('patients', request.url, 'auth_error');
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
     * - call pages (video calls)
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|public|api/health|consultation|call).*)',
  ],
};
