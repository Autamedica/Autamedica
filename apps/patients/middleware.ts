/**
 * Secure middleware for Patients portal
 * Uses @supabase/ssr for session verification (compatible with ECC + HS256 keys)
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
  '/auth/callback',
  '/consultation',
  '/call',
  '/test-call',
];

// Allowed roles for patients portal
const ALLOWED_ROLES = ['patient', 'organization_admin', 'platform_admin'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  const response = NextResponse.next();

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

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    const loginUrl = buildSafeLoginUrl('patients', request.url, 'session_expired');
    return NextResponse.redirect(new URL(loginUrl));
  }

  // Check role from user metadata
  const userRole = (user.user_metadata?.role as string) || '';
  if (userRole && !ALLOWED_ROLES.includes(userRole)) {
    const loginUrl = buildSafeLoginUrl('patients', undefined, 'wrong_role');
    return NextResponse.redirect(new URL(loginUrl));
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|public|api/health|consultation|call|test-call).*)',
  ],
};
