/**
 * OAuth callback API route.
 *
 * Handles:
 * 1. Code exchange for session (OAuth + email confirmation)
 * 2. Persist role to user_metadata
 * 3. Cross-domain cookie setting (.autamedica.com)
 * 4. Token passing to portal subdominios
 */

import type { APIRoute } from 'astro';
import { createServerClient } from '@supabase/ssr';
import { validateRedirectUrl, isProduction } from '../../lib/auth-utils';

/** Role → portal base URL mapping (server-side, no process.env barrel) */
const ROLE_BASE_URLS: Record<string, string> = isProduction()
  ? {
      patient: 'https://patients.autamedica.com',
      doctor: 'https://doctors.autamedica.com',
      company: 'https://companies.autamedica.com',
      company_admin: 'https://companies.autamedica.com',
      organization_admin: 'https://admin.autamedica.com',
      platform_admin: 'https://www.autamedica.com',
    }
  : {
      patient: 'http://localhost:3002',
      doctor: 'http://localhost:3001',
      company: 'http://localhost:3003',
      company_admin: 'http://localhost:3003',
      organization_admin: 'http://localhost:3004',
      platform_admin: 'http://localhost:3000',
    };

const PORTAL_TO_ROLE: Record<string, string> = {
  patients: 'patient',
  doctors: 'doctor',
  companies: 'company_admin',
  admin: 'organization_admin',
};

const VALID_ROLES = new Set(Object.keys(ROLE_BASE_URLS));

function isValidRole(role: string): boolean {
  return VALID_ROLES.has(role);
}

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('returnTo');
  const role = requestUrl.searchParams.get('role');

  // Handle token-passing callback (portal receiving tokens from auth hub)
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');

  if (accessToken && refreshToken) {
    // This is a portal-side callback receiving tokens — set cookies and redirect
    const supabase = createServerClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            const cookieHeader = request.headers.get('cookie') ?? '';
            if (!cookieHeader) return [];
            return cookieHeader.split('; ').map(c => {
              const eq = c.indexOf('=');
              return {
                name: eq >= 0 ? c.slice(0, eq) : c,
                value: eq >= 0 ? c.slice(eq + 1) : '',
              };
            });
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookies.set(name, value, {
                ...options,
                domain: isProduction() ? '.autamedica.com' : undefined,
                path: '/',
                sameSite: 'lax',
                secure: isProduction(),
              });
            }
          },
        },
      }
    );

    await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return redirect(returnTo || '/');
  }

  // No code → redirect to login
  if (!code) {
    return redirect('/auth/login?error=no_code');
  }

  try {
    const supabase = createServerClient(
      import.meta.env.PUBLIC_SUPABASE_URL,
      import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            const cookieHeader = request.headers.get('cookie') ?? '';
            if (!cookieHeader) return [];
            return cookieHeader.split('; ').map(c => {
              const eq = c.indexOf('=');
              return {
                name: eq >= 0 ? c.slice(0, eq) : c,
                value: eq >= 0 ? c.slice(eq + 1) : '',
              };
            });
          },
          setAll(cookiesToSet) {
            for (const { name, value, options } of cookiesToSet) {
              cookies.set(name, value, {
                ...options,
                domain: isProduction() ? '.autamedica.com' : undefined,
                path: '/',
                sameSite: 'lax',
                secure: isProduction(),
              });
            }
          },
        },
      }
    );

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
    }

    // Persist role to user_metadata if provided
    if (role && data.user) {
      await supabase.auth.updateUser({ data: { role } });
    }

    // Determine redirect destination
    const sessionAccessToken = data.session?.access_token;
    const sessionRefreshToken = data.session?.refresh_token;

    if (!sessionAccessToken || !sessionRefreshToken) {
      return redirect('/auth/login?error=session_tokens_missing');
    }

    // Resolve returnTo
    const safeReturnTo = returnTo && validateRedirectUrl(returnTo)
      ? new URL(returnTo)
      : null;

    // Resolve role from query → metadata → portal metadata
    const userMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const roleFromQuery = role && isValidRole(role) ? role : undefined;
    const metadataRole = typeof userMetadata.role === 'string' && isValidRole(userMetadata.role)
      ? userMetadata.role
      : undefined;
    const metadataPortal = typeof userMetadata.portal === 'string'
      ? PORTAL_TO_ROLE[userMetadata.portal]
      : undefined;

    const resolvedRole = roleFromQuery ?? metadataRole ?? metadataPortal;

    // Determine destination base URL
    const destinationBase = safeReturnTo
      ? `${safeReturnTo.protocol}//${safeReturnTo.host}`
      : resolvedRole && ROLE_BASE_URLS[resolvedRole]
        ? new URL('/', ROLE_BASE_URLS[resolvedRole]).origin
        : undefined;

    let destination: string;

    if (destinationBase) {
      // Pass tokens to the destination portal
      const tokenParams = new URLSearchParams({
        access_token: sessionAccessToken,
        refresh_token: sessionRefreshToken,
      }).toString();
      destination = `${destinationBase}/auth/callback?${tokenParams}`;
    } else {
      // No role resolved — ask user to select one
      destination = '/auth/select-role';
    }

    return redirect(destination);
  } catch {
    return redirect('/auth/login?error=callback_error');
  }
};
