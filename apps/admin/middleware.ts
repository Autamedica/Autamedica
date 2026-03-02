/**
 * Secure middleware for Admin portal
 * Implements session validation and admin role verification
 * Uses getUser() for server-side JWT validation (consistent with other portals)
 */

import { buildSafeLoginUrl } from '@autamedica/shared';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES = [
  '/_next',
  '/favicon.ico',
  '/public',
  '/api/health',
  '/manifest.webmanifest',
];

const ALLOWED_ADMIN_ROLES = new Set(['admin', 'organization_admin', 'platform_admin']);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              request.cookies.set(name, value);
              response.cookies.set(name, value, options);
            }
          },
        },
      }
    );

    // getUser() validates the JWT server-side (unlike getSession() which only decodes locally)
    const { data: { user }, error } = await supabase.auth.getUser();

    // If no user, redirect to auth
    if (!user || error) {
      const loginUrl = buildSafeLoginUrl('admin', request.url, 'session_expired');
      return NextResponse.redirect(new URL(loginUrl));
    }

    // Verify admin role
    const userRole = (user.user_metadata?.role as string) || (user.app_metadata?.role as string) || '';

    if (!userRole || !ALLOWED_ADMIN_ROLES.has(userRole)) {
      const unauthorizedUrl = new URL('/unauthorized', request.url);
      return NextResponse.redirect(unauthorizedUrl);
    }

    // Admin verified - allow access
    return response;
  } catch (_err) {
    // If anything fails, fallback to login
    const loginUrl = buildSafeLoginUrl('admin', request.url, 'auth_error');
    return NextResponse.redirect(new URL(loginUrl));
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|public|api/health).*)',
  ],
};
