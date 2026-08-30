/**
 * OAuth callback API route.
 *
 * Handles three cases:
 * 1. OAuth code exchange (Google sign-in) — has `code` param
 * 2. Already-authenticated redirect (email/password sign-in) — has session in cookies
 * 3. Legacy token-passing (deprecated) — redirects without tokens, relies on shared cookies
 *
 * After auth, role is resolved from trusted metadata first. Admin roles always
 * override URL hints and returnTo so public UI parameters cannot send an admin
 * session to a non-admin portal.
 * Falls back to /auth/select-role for users who haven't picked a role yet.
 */

import type { APIRoute } from 'astro';
import {
  isValidRole,
  resolveRoleFromPortal,
  logger,
} from '@autamedica/shared';
import { validateRedirectUrl, isProduction } from '../../lib/auth-utils';
import { getEnvironment, getDomainConfig } from '@autamedica/auth';
import { resolvePublicSupabaseEnv } from '../../lib/runtime-env';
import { createSupabaseCookieClient, type CookieMethodsServer } from '../../lib/supabase';

/** Roles that users can self-assign during registration/login. Admin roles require backend assignment. */
const SELF_ASSIGNABLE_ROLES = new Set<string>(['patient', 'doctor', 'company_admin', 'company']);
const ADMIN_ROLES = new Set<string>(['admin', 'organization_admin', 'platform_admin']);

function buildSupabaseClient(
  request: Request,
  cookies: Parameters<APIRoute>[0]['cookies'],
  runtimeEnv?: Record<string, unknown> | null,
) {
  const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(runtimeEnv);

  if (!publicSupabaseUrl || !publicSupabaseAnonKey) {
    throw new Error(
      `[auth/callback] Missing env: PUBLIC_SUPABASE_URL=${!!publicSupabaseUrl}, ` +
        `PUBLIC_SUPABASE_ANON_KEY=${!!publicSupabaseAnonKey}.`,
    );
  }

  const cookieMethods: CookieMethodsServer = {
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
      const reqHostname = new URL(request.url).hostname;
      const useDomainOverride = isProduction() && (reqHostname === 'autamedica.com' || reqHostname.endsWith('.autamedica.com'));
      const domainOverride = useDomainOverride ? '.autamedica.com' : undefined;
      for (const { name, value, options } of cookiesToSet) {
        cookies.set(name, value, {
          ...options,
          domain: domainOverride,
          path: '/',
          sameSite: 'lax',
          secure: isProduction(),
        } as Parameters<typeof cookies.set>[2]);
      }
    },
  };

  return createSupabaseCookieClient(publicSupabaseUrl, publicSupabaseAnonKey, cookieMethods);
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

function isAdminRole(role: unknown): role is string {
  return typeof role === 'string' && ADMIN_ROLES.has(role);
}

function readMetadataRole(metadata: Record<string, unknown> | null | undefined): string | undefined {
  const role = metadata?.role;
  return typeof role === 'string' ? role : undefined;
}

/** Resolve role from trusted metadata before URL hints. */
function resolveRole(
  roleHint: string | null,
  userMetadata: Record<string, unknown>,
  appMetadata?: Record<string, unknown>,
): string | undefined {
  const fromAppMeta = readMetadataRole(appMetadata);
  if (isAdminRole(fromAppMeta)) return fromAppMeta;

  const fromUserMeta = readMetadataRole(userMetadata);
  if (isAdminRole(fromUserMeta)) return fromUserMeta;

  const fromHint =
    roleHint && SELF_ASSIGNABLE_ROLES.has(roleHint) && isValidRole(roleHint)
      ? roleHint
      : undefined;
  const fromMeta =
    fromUserMeta && isValidRole(fromUserMeta)
      ? fromUserMeta
      : undefined;
  const fromPortal =
    typeof userMetadata.portal === 'string'
      ? resolveRoleFromPortal(userMetadata.portal)
      : undefined;
  return fromMeta ?? fromHint ?? fromPortal;
}

function getSafeRedirect(
  resolvedRole: string | undefined,
  parsedReturnTo: { absolute: URL | null; relativePath: string | null },
  requestUrl: URL,
): string {
  const requestHostname = requestUrl.hostname;
  if (isAdminRole(resolvedRole)) {
    return getRolePath(resolvedRole, requestHostname);
  }

  if (parsedReturnTo.absolute) {
    const isRootLanding =
      (parsedReturnTo.absolute.hostname === 'autamedica.com' ||
        parsedReturnTo.absolute.hostname === 'www.autamedica.com') &&
      (parsedReturnTo.absolute.pathname === '/' || parsedReturnTo.absolute.pathname === '');

    // Si returnTo apunta a la raíz comercial sin subruta, redirigir al portal del rol
    if (!isRootLanding) {
      if (parsedReturnTo.absolute.origin === requestUrl.origin) {
        return parsedReturnTo.absolute.pathname + parsedReturnTo.absolute.search;
      }
      if (validateRedirectUrl(parsedReturnTo.absolute.toString())) {
        return parsedReturnTo.absolute.toString();
      }
    }
  }

  if (parsedReturnTo.relativePath) {
    if (parsedReturnTo.relativePath === '/') {
      return getRolePath(resolvedRole ?? '', requestHostname);
    }
    const base = getRolePath(resolvedRole ?? '', requestHostname);
    if (base.startsWith('http')) {
      try {
        return new URL(parsedReturnTo.relativePath, base).toString();
      } catch {
        return parsedReturnTo.relativePath;
      }
    }
    return parsedReturnTo.relativePath;
  }

  return getRolePath(resolvedRole ?? '', requestHostname);
}

/** Map role to redirect path — uses DomainConfig URLs in prod/staging, query param in dev */
function getRolePath(role: string, requestHostname?: string): string {
  const env = getEnvironment(requestHostname);

  if (env === 'development') {
    const DEV_PORTALS: Record<string, string> = {
      patient: 'patient',
      doctor: 'doctor',
      pharmacist: 'pharmacy',
      company: 'company',
      company_admin: 'company',
      admin: 'admin',
      organization_admin: 'admin',
      platform_admin: 'admin',
    };
    const portal = DEV_PORTALS[role];
    return portal ? `/?portal=${portal}` : '/auth/select-role';
  }

  const config = getDomainConfig(requestHostname);
  const ROLE_TO_APP: Record<string, keyof typeof config.apps> = {
    patient: 'patients',
    doctor: 'doctors',
    pharmacist: 'pharmacy',
    company: 'companies',
    company_admin: 'companies',
    organization_admin: 'admin',
    platform_admin: 'admin',
    admin: 'admin',
  };
  const appKey = ROLE_TO_APP[role];
  return appKey ? config.apps[appKey] : '/auth/select-role';
}

export const GET: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('returnTo');
  const roleHint = requestUrl.searchParams.get('role');
  const parsedReturnTo = parseReturnToParam(returnTo);

  // If redirected with OAuth error params and no code, forward to login page
  if (
    !code &&
    (requestUrl.searchParams.has('error') ||
      requestUrl.searchParams.has('error_code') ||
      requestUrl.searchParams.has('error_description'))
  ) {
    const loginErrorUrl = new URL('/auth/login', request.url);
    loginErrorUrl.search = requestUrl.search;
    return redirect(loginErrorUrl.toString());
  }

  const supabase = buildSupabaseClient(request, cookies, locals.runtime?.env);

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

      // Only assign self-assignable role on first login if user does not already have a role
      if (roleHint && SELF_ASSIGNABLE_ROLES.has(roleHint) && isValidRole(roleHint) && data.user) {
        const existingRole = data.user.user_metadata?.role;
        if (!existingRole) {
          await supabase.auth.updateUser({ data: { role: roleHint } });
        }
      }

      const userMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const appMetadata = (data.user?.app_metadata ?? {}) as Record<string, unknown>;
      const resolvedRole = resolveRole(roleHint, userMetadata, appMetadata);

      return redirect(getSafeRedirect(resolvedRole, parsedReturnTo, requestUrl));
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
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;
  const resolvedRole = resolveRole(roleHint, userMeta, appMeta);

  return redirect(getSafeRedirect(resolvedRole, parsedReturnTo, requestUrl));
};
