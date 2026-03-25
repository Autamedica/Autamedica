/**
 * OAuth callback API route.
 *
 * Handles three cases:
 * 1. OAuth code exchange (Google sign-in) — has `code` param
 * 2. Already-authenticated redirect (email/password sign-in) — has session in cookies
 * 3. Legacy token-passing (deprecated) — redirects without tokens, relies on shared cookies
 *
 * After auth, role is resolved from: query param → user_metadata → portal metadata.
 * Falls back to /auth/select-role for users who haven't picked a role yet.
 */

import type { APIRoute } from 'astro';
import { createServerClient, type CookieMethodsServer } from '@supabase/ssr';
import {
  isValidRole,
  resolveRoleFromPortal,
  logger,
  type UserRole
} from '@autamedica/shared';
import { validateRedirectUrl, isProduction } from '../../lib/auth-utils';

/** Roles that users can self-assign during registration/login. Admin roles require backend assignment. */
const SELF_ASSIGNABLE_ROLES = new Set<string>(['patient', 'doctor', 'company_admin', 'company']);

function buildSupabaseClient(request: Request, cookies: Parameters<APIRoute>[0]['cookies']) {
  return createServerClient(
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
        setAll(cookiesToSet: Parameters<NonNullable<CookieMethodsServer['setAll']>>[0]) {
          for (const { name, value, options } of cookiesToSet) {
            cookies.set(name, value, {
              ...options,
              domain: isProduction() ? '.autamedica.com' : undefined,
              path: '/',
              sameSite: 'lax',
              secure: isProduction(),
            } as Parameters<typeof cookies.set>[2]);
          }
        },
      },
    }
  );
}

function parseReturnToParam(
  returnTo: string | null
): { absolute: URL | null; relativePath: string | null } {
  if (!returnTo) {
    return { absolute: null, relativePath: null };
  }

  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    return { absolute: null, relativePath: returnTo };
  }

  if (!validateRedirectUrl(returnTo)) {
    return { absolute: null, relativePath: null };
  }

  try {
    return { absolute: new URL(returnTo), relativePath: null };
  } catch {
    return { absolute: null, relativePath: null };
  }
}

/** Resolve role from user metadata */
function resolveRole(
  roleHint: string | null,
  userMetadata: Record<string, unknown>
): UserRole | undefined {
  const fromHint = roleHint && isValidRole(roleHint) ? roleHint as UserRole : undefined;
  const fromMeta =
    typeof userMetadata.role === 'string' && isValidRole(userMetadata.role)
      ? userMetadata.role as UserRole
      : undefined;
  const fromPortal =
    typeof userMetadata.portal === 'string'
      ? resolveRoleFromPortal(userMetadata.portal)
      : undefined;
  return fromHint ?? fromMeta ?? fromPortal;
}

/** Map role to redirect path — uses subdomain in prod, query param in dev */
function getRolePath(role: string): string {
  if (isProduction()) {
    const PROD_PATHS: Record<string, string> = {
      patient: 'https://paciente.autamedica.com',
      doctor: 'https://doctor.autamedica.com',
      company: 'https://empresa.autamedica.com',
      company_admin: 'https://empresa.autamedica.com',
      organization_admin: 'https://admin.autamedica.com',
      platform_admin: 'https://admin.autamedica.com',
      admin: 'https://admin.autamedica.com',
    };
    return PROD_PATHS[role] ?? '/auth/select-role';
  }

  // Dev: use ?portal= query param to simulate subdomain detection
  const DEV_PORTALS: Record<string, string> = {
    patient: 'patient',
    doctor: 'doctor',
    company: 'company',
    company_admin: 'company',
    admin: 'admin',
    organization_admin: 'admin',
    platform_admin: 'admin',
  };
  const portal = DEV_PORTALS[role];
  return portal ? `/?portal=${portal}` : '/auth/select-role';
}

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('returnTo');
  const roleHint = requestUrl.searchParams.get('role');
  const parsedReturnTo = parseReturnToParam(returnTo);

  const supabase = buildSupabaseClient(request, cookies);

  // ── Case 1: OAuth code exchange ──
  if (code) {
    try {
      // Log cookie state for PKCE debugging — the code_verifier must be
      // present in the request cookies for the server-side exchange to succeed.
      const rawCookies = request.headers.get('cookie') ?? '';
      const cookieNames = rawCookies
        .split('; ')
        .map(c => c.split('=')[0])
        .filter(n => n.includes('sb-') || n.includes('code') || n.includes('pkce'));
      logger.info('[Callback] exchangeCodeForSession starting', {
        hasCookies: rawCookies.length > 0,
        relevantCookies: cookieNames,
      });

      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        const isPkce = /pkce|code.verifier/i.test(error.message);
        logger.error('[Callback] exchangeCodeForSession failed', {
          isPkce,
          errorMessage: error.message,
          cookieNames,
        });
        const loginParams = new URLSearchParams({ error: isPkce ? 'pkce_failed' : 'auth_failed' });
        if (isPkce) loginParams.set('retry', 'google');
        if (roleHint) loginParams.set('role', roleHint);
        if (returnTo) loginParams.set('returnTo', returnTo);
        return redirect(`/auth/login?${loginParams.toString()}`);
      }

      // Only allow self-assignable roles via URL param (prevent privilege escalation)
      if (roleHint && SELF_ASSIGNABLE_ROLES.has(roleHint) && isValidRole(roleHint) && data.user) {
        const existingRole = data.user.user_metadata?.role;
        if (existingRole !== roleHint) {
          await supabase.auth.updateUser({ data: { role: roleHint } });
        }
      }

      const userMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const resolvedRole = resolveRole(roleHint, userMetadata);

      // Determine redirect destination
      if (parsedReturnTo.absolute) {
        // Absolute returnTo: only allow if same origin
        if (parsedReturnTo.absolute.origin === requestUrl.origin) {
          return redirect(parsedReturnTo.absolute.pathname + parsedReturnTo.absolute.search);
        }
        // Cross-origin: validate and redirect (cookies shared via domain)
        if (validateRedirectUrl(parsedReturnTo.absolute.toString())) {
          return redirect(parsedReturnTo.absolute.toString());
        }
      }

      if (parsedReturnTo.relativePath) {
        return redirect(parsedReturnTo.relativePath);
      }

      // Default role-based redirect
      return redirect(getRolePath(resolvedRole ?? ''));
    } catch {
      return redirect('/auth/login?error=callback_error');
    }
  }

  // ── Case 2: Already authenticated (email/password, redirected to callback) ──
  // Verify server-side with getUser(), not getSession()
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return redirect('/auth/login');
  }

  const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const resolvedRole = resolveRole(roleHint, userMeta);

  if (parsedReturnTo.absolute) {
    if (parsedReturnTo.absolute.origin === requestUrl.origin) {
      return redirect(parsedReturnTo.absolute.pathname + parsedReturnTo.absolute.search);
    }
    if (validateRedirectUrl(parsedReturnTo.absolute.toString())) {
      return redirect(parsedReturnTo.absolute.toString());
    }
  }

  if (parsedReturnTo.relativePath) {
    return redirect(parsedReturnTo.relativePath);
  }

  return redirect(getRolePath(resolvedRole ?? ''));
};
