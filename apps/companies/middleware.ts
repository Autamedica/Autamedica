/**
 * Secure middleware for Companies portal
 * Uses JWT verification instead of Supabase client
 */

import { buildSafeLoginUrl, getSession, getTargetUrlByRole, hasRole, isValidRole, logger } from '@autamedica/shared';
import { NextRequest, NextResponse } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/_next',
  '/favicon.ico',
  '/public',
  '/api/health',
  '/manifest.webmanifest',
];

// Allowed roles for companies portal
const ALLOWED_ROLES = ['company_admin', 'organization_admin', 'platform_admin'] as const;
const ROBOTS_TAG_VALUE = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

function withNoIndex(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', ROBOTS_TAG_VALUE);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { origin, search } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return withNoIndex(NextResponse.next());
  }

  try {
    // Get session using JWT verification (no Supabase client needed)
    // Cast needed due to monorepo Next type resolution mismatch between apps/packages.
    const session = await getSession(request as any);

    // No session - redirect to login
    if (!session) {
      const loginUrl = buildSafeLoginUrl('companies', request.url, 'session_expired');
      return NextResponse.redirect(new URL(loginUrl));
    }

    // Check if user has allowed role for companies portal
    if (!hasRole(session, [...ALLOWED_ROLES])) {
      // User has wrong role - redirect to their correct portal
      const role = session.user.role;
      if (!role || !isValidRole(role)) {
        const loginUrl = buildSafeLoginUrl('companies', request.url, 'wrong_role');
        return NextResponse.redirect(new URL(loginUrl));
      }
      return NextResponse.redirect(new URL(getTargetUrlByRole(role)));
    }

    // Verify user is on correct portal for their role
    const role = session.user.role;
    if (!role || !isValidRole(role)) {
      const loginUrl = buildSafeLoginUrl('companies', request.url, 'wrong_role');
      return NextResponse.redirect(new URL(loginUrl));
    }

    const expectedOrigin = new URL(getTargetUrlByRole(role)).origin;
    if (origin !== expectedOrigin) {
      return NextResponse.redirect(new URL(`${pathname}${search}`, expectedOrigin));
    }

    // All checks passed
    return withNoIndex(NextResponse.next());
  } catch (error) {
    logger.error('Middleware error:', error);

    // On error, redirect to login
    const loginUrl = buildSafeLoginUrl('companies', request.url, 'auth_error');
    return NextResponse.redirect(new URL(loginUrl));
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
     */
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|public|api/health).*)',
  ],
};
