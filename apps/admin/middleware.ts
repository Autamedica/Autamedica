/**
 * Secure middleware for Admin portal
 * Implements session validation and admin role verification
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { buildSafeLoginUrl } from '@autamedica/shared';

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

  // Create Supabase client for middleware
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          request.cookies.set({ name, value: '', ...options });
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          response.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  // Get session
  const { data: { session }, error } = await supabase.auth.getSession();

  // If no session, redirect to auth
  if (!session || error) {
    const loginUrl = buildSafeLoginUrl('admin', request.url, 'session_expired');
    return NextResponse.redirect(loginUrl);
  }

  // Verify admin role
  const userRole = session.user.user_metadata?.role || session.user.app_metadata?.role;

  if (!userRole || !ALLOWED_ADMIN_ROLES.has(userRole)) {
    // Not an admin - redirect to unauthorized or their portal
    const unauthorizedUrl = new URL('/unauthorized', request.url);
    return NextResponse.redirect(unauthorizedUrl);
  }

  // Admin verified - allow access
  return response;
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
