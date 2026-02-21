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
import {
  getTargetUrlByRole,
  isValidRole,
  resolveRoleFromPortal,
  type UserRole
} from '@autamedica/shared';
import { validateRedirectUrl, isProduction } from '../../lib/auth-utils';

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

/** Redirect to the correct portal, passing session tokens cross-domain */
function buildPortalRedirect(
  portalBase: string,
  accessToken: string,
  refreshToken: string,
  returnTo?: string
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

function getRoleBaseOrigin(role: UserRole | undefined): string | undefined {
  if (!role) {
    return undefined;
  }

  try {
    return new URL(getTargetUrlByRole(role)).origin;
  } catch {
    return undefined;
  }
}

function resolveReturnToForDestination(
  parsedReturnTo: { absolute: URL | null; relativePath: string | null },
  destinationBase: string
): string | undefined {
  if (parsedReturnTo.absolute) {
    return parsedReturnTo.absolute.toString();
  }

  if (parsedReturnTo.relativePath) {
    return new URL(parsedReturnTo.relativePath, destinationBase).toString();
  }

  return undefined;
}

export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('returnTo');
  const roleHint = requestUrl.searchParams.get('role');
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');
  const parsedReturnTo = parseReturnToParam(returnTo);

  const supabase = buildSupabaseClient(request, cookies);

  // ── Case 2: Token-passing (portal receiving tokens from auth hub) ──
  if (accessToken && refreshToken) {
    const { error: setSessionError } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (setSessionError) {
      return redirect(`/auth/login?error=${encodeURIComponent(setSessionError.message)}`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    const userMeta = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const resolvedRole = resolveRole(roleHint, userMeta);
    const destinationBase = parsedReturnTo.absolute?.origin ?? getRoleBaseOrigin(resolvedRole);

    if (destinationBase) {
      const resolvedReturnTo = resolveReturnToForDestination(parsedReturnTo, destinationBase);
      if (new URL(destinationBase).origin === requestUrl.origin) {
        return redirect(resolvedReturnTo || '/');
      }

      return redirect(
        buildPortalRedirect(destinationBase, accessToken, refreshToken, resolvedReturnTo)
      );
    }

    return redirect('/auth/select-role');
  }

  // ── Case 3: Already authenticated (email/password, no OAuth code) ──
  if (!code) {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.access_token && session?.refresh_token) {
      const userMeta = (session.user?.user_metadata ?? {}) as Record<string, unknown>;
      const resolvedRole = resolveRole(roleHint, userMeta);
      const destinationBase = parsedReturnTo.absolute?.origin ?? getRoleBaseOrigin(resolvedRole);

      if (destinationBase) {
        const resolvedReturnTo = resolveReturnToForDestination(parsedReturnTo, destinationBase);
        if (new URL(destinationBase).origin === requestUrl.origin) {
          return redirect(resolvedReturnTo || '/');
        }

        return redirect(
          buildPortalRedirect(
            destinationBase,
            session.access_token,
            session.refresh_token,
            resolvedReturnTo
          )
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

    if (roleHint && isValidRole(roleHint) && data.user) {
      await supabase.auth.updateUser({ data: { role: roleHint } });
    }

    const sessionAccessToken = data.session?.access_token;
    const sessionRefreshToken = data.session?.refresh_token;

    if (!sessionAccessToken || !sessionRefreshToken) {
      return redirect('/auth/login?error=session_tokens_missing');
    }

    const userMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
    const resolvedRole = resolveRole(roleHint, userMetadata);
    const destinationBase = parsedReturnTo.absolute?.origin ?? getRoleBaseOrigin(resolvedRole);

    if (destinationBase) {
      const resolvedReturnTo = resolveReturnToForDestination(parsedReturnTo, destinationBase);
      if (new URL(destinationBase).origin === requestUrl.origin) {
        return redirect(resolvedReturnTo || '/');
      }

      return redirect(
        buildPortalRedirect(
          destinationBase,
          sessionAccessToken,
          sessionRefreshToken,
          resolvedReturnTo
        )
      );
    }

    return redirect('/auth/select-role');
  } catch {
    return redirect('/auth/login?error=callback_error');
  }
};
