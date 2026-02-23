/**
 * Secure middleware for Companies portal
 * Uses @supabase/ssr for session verification (compatible with ECC + HS256 keys)
 */

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

// Allowed roles for companies portal
const ALLOWED_ROLES = ['company_admin', 'organization_admin', 'platform_admin'];
const ROBOTS_TAG_VALUE = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

function withNoIndex(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', ROBOTS_TAG_VALUE);
  return response;
}

function getAuthHubUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function buildLoginRedirect(portal: string, returnTo?: string, error?: string): string {
  const authHub = getAuthHubUrl();
  const url = new URL('/auth/login', authHub);
  url.searchParams.set('portal', portal);
  if (returnTo) url.searchParams.set('returnTo', returnTo);
  if (error) url.searchParams.set('error', error);
  return url.toString();
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return withNoIndex(NextResponse.next());
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
    const loginUrl = buildLoginRedirect('companies', request.url, 'session_expired');
    return NextResponse.redirect(new URL(loginUrl));
  }

  // Check role from user metadata
  const userRole = (user.user_metadata?.role as string) || '';
  if (userRole && !ALLOWED_ROLES.includes(userRole)) {
    const loginUrl = buildLoginRedirect('companies', undefined, 'wrong_role');
    return NextResponse.redirect(new URL(loginUrl));
  }

  return withNoIndex(response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|public|api/health).*)',
  ],
};
