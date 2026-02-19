/**
 * OAuth callback API route.
 *
 * Handles three cases:
 * 1. OAuth code exchange (Google sign-in) — has `code` param
 * 2. Token-passing callback (portal receiving tokens from auth hub) — has `access_token` + `refresh_token`
 * 3. Already-authenticated redirect (email/password sign-in) — has session in cookies, no code
 *
 * After auth, role is resolved from: query param → user_metadata → portal metadata.
 * Falls back to /auth/select-role for users who haven't picked a role yet.
 */

import type { APIRoute } from 'astro';
import { createServerClient } from '@supabase/ssr';
import { validateRedirectUrl, isProduction } from '../../lib/auth-utils';

/** Role → portal base URL mapping (server-side) */
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
        setAll(cookiesToSet) {
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

/** Redirect to the correct portal, passing session tokens cross-domain */
function buildPortalRedirect(
  portalBase: string,
  accessToken: string,
  refreshToken: string,
  returnTo?: string | null
): string {
  const params = new URLSearchParams({
    access_token: accessToken,
    refresh_token: refreshToken,
    ...(returnTo ? { returnTo } : {}),
  });
  return `${portalBase}/auth/callback?${params.toString()}`;
}

/** Resolve role from user metadata */
function resolveRole(
  roleHint: string | null,
  userMetadata: Record<string, unknown>
): string | undefined {
  const fromHint = roleHint && isValidRole(roleHint) ? roleHint : undefined;
  const fromMeta =
    typeof userMetadata.role === 'string' && isValidRole(userMetadata.role)
      ? userMetadata.role
      : undefined;
  const fromPortal =
    typeof userMetadata.portal === 'string'
      ? PORTAL_TO_ROLE[userMetadata.portal]
      : undefined;
  return fromHint ?? fromMeta ?? fromPortal;
}

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('returnTo');
  const roleHint = requestUrl.searchParams.get('role');
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');

  const supabase = buildSupabaseClient(request, cookies);

  // ── Case 2: Token-passing (portal receiving tokens from auth hub) ──
  if (accessToken && refreshToken) {
    await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

    if (returnTo && validateRedirectUrl(returnTo)) {
      return redirect(returnTo);
    }

    // Resolve role from the freshly-set session
    const { data: { user } } = await supabase.auth.getUser();
    const userMeta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const resolved = resolveRole(roleHint, userMeta);

    if (resolved && ROLE_BASE_URLS[resolved]) {
      const portalBase = ROLE_BASE_URLS[resolved];
      const currentOrigin = new URL(request.url).origin;
      if (new URL(portalBase).origin === currentOrigin) {
        return redirect('/');
      }
      return redirect(buildPortalRedirect(portalBase, accessToken, refreshToken, returnTo));
    }

    return redirect('/auth/select-role');
  }

  // ── Case 3: Already authenticated (email/password, no OAuth code) ──
  if (!code) {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token && session?.refresh_token) {
      const userMeta = (session.user?.user_metadata ?? {}) as Record<string, unknown>;
      const resolved = resolveRole(roleHint, userMeta);

      if (resolved && ROLE_BASE_URLS[resolved]) {
        const portalBase = ROLE_BASE_URLS[resolved];
        const currentOrigin = new URL(request.url).origin;
        if (new URL(portalBase).origin === currentOrigin) {
          return redirect(returnTo || '/');
        }
        return redirect(
          buildPortalRedirect(portalBase, session.access_token, session.refresh_token, returnTo)
        );
      }

      return redirect('/auth/select-role');
    }

    return redirect('/auth/login');
  }

  // ── Case 1: OAuth code exchange ──
  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
    }

    // Persist role to user_metadata if provided via query param
    if (roleHint && data.user) {
      await supabase.auth.updateUser({ data: { role: roleHint } });
    }

    const sessionAccessToken = data.session?.access_token;
    const sessionRefreshToken = data.session?.refresh_token;

    if (!sessionAccessToken || !sessionRefreshToken) {
      return redirect('/auth/login?error=session_tokens_missing');
    }

    const safeReturnTo =
      returnTo && validateRedirectUrl(returnTo) ? new URL(returnTo) : null;

    const userMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const resolvedRole = resolveRole(roleHint, userMetadata);

    const destinationBase = safeReturnTo
      ? `${safeReturnTo.protocol}//${safeReturnTo.host}`
      : resolvedRole && ROLE_BASE_URLS[resolvedRole]
        ? new URL('/', ROLE_BASE_URLS[resolvedRole]).origin
        : undefined;

    if (destinationBase) {
      return redirect(
        buildPortalRedirect(destinationBase, sessionAccessToken, sessionRefreshToken, returnTo)
      );
    }

    return redirect('/auth/select-role');
  } catch {
    return redirect('/auth/login?error=callback_error');
  }
};
