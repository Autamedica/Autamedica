import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import {
  ensureClientEnv,
  logger,
  isProduction,
  isValidRole,
  resolveRoleFromPortal,
  getTargetUrlByRole,
  type UserRole,
} from '@autamedica/shared';
import { validateRedirectUrl } from '@/lib/cookies';

// Configure for Cloudflare Pages (Edge Runtime)
export const runtime = 'edge';

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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('returnTo');
  const role = requestUrl.searchParams.get('role');

  if (!code) {
    return NextResponse.redirect(new URL('/auth/login?error=no_code', requestUrl.origin));
  }

  try {
    const cookieStore = await cookies();

    // Create Supabase client with cookie configuration for cross-subdomain sharing
    const supabase = createServerClient(
      ensureClientEnv('NEXT_PUBLIC_SUPABASE_URL'),
      ensureClientEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            // Set domain to .autamedica.com for cross-subdomain cookie sharing
            const cookieOptions = {
              ...options,
              domain: isProduction() ? '.autamedica.com' : undefined,
              path: '/',
              sameSite: 'lax' as const,
              secure: isProduction(),
            };
            cookieStore.set({ name, value, ...cookieOptions });
          },
          remove(name: string, options: CookieOptions) {
            const cookieOptions = {
              ...options,
              domain: isProduction() ? '.autamedica.com' : undefined,
              path: '/',
            };
            cookieStore.set({ name, value: '', ...cookieOptions, maxAge: 0 });
          },
        },
      }
    );

    // Exchange code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      logger.error('Error exchanging code for session:', error);
      return NextResponse.redirect(
        new URL(`/auth/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin)
      );
    }

    // logger.info('Session created successfully for user:', data.user?.email);

    // Persist role to user_metadata only if role is validated.
    if (role && data.user) {
      if (!isValidRole(role)) {
        logger.warn('Ignoring invalid role received in callback query:', role);
      } else {
        const { error: updateError } = await supabase.auth.updateUser({
          data: { role }
        });

        if (updateError) {
          logger.error('Error updating user metadata with role:', updateError);
        }
      }
    }

    // Determine redirect destination
    const accessToken = data.session?.access_token;
    const refreshToken = data.session?.refresh_token;

    if (!accessToken || !refreshToken) {
      logger.error('Missing session tokens after exchange');
      return NextResponse.redirect(
        new URL('/auth/login?error=session_tokens_missing', requestUrl.origin)
      );
    }

    const parsedReturnTo = parseReturnToParam(returnTo);
    const userMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;

    const roleFromQuery = role && isValidRole(role) ? role as UserRole : undefined;
    const metadataRoleValue = typeof userMetadata.role === 'string' ? userMetadata.role : undefined;
    const roleFromMetadata = metadataRoleValue && isValidRole(metadataRoleValue)
      ? metadataRoleValue as UserRole
      : undefined;
    const metadataPortalValue = typeof userMetadata.portal === 'string' ? userMetadata.portal : undefined;
    const roleFromPortal = resolveRoleFromPortal(metadataPortalValue);

    const resolvedRole = roleFromQuery ?? roleFromMetadata ?? roleFromPortal;

    const destinationBase = parsedReturnTo.absolute
      ? parsedReturnTo.absolute.origin
      : resolvedRole
        ? new URL(getTargetUrlByRole(resolvedRole)).origin
        : undefined;

    if (destinationBase) {
      const destination = new URL('/auth/callback', destinationBase);
      destination.searchParams.set('access_token', accessToken);
      destination.searchParams.set('refresh_token', refreshToken);

      if (parsedReturnTo.absolute) {
        destination.searchParams.set('returnTo', parsedReturnTo.absolute.toString());
      } else if (parsedReturnTo.relativePath) {
        destination.searchParams.set(
          'returnTo',
          new URL(parsedReturnTo.relativePath, destinationBase).toString()
        );
      }

      return NextResponse.redirect(destination);
    }

    return NextResponse.redirect(new URL('/auth/select-role', requestUrl.origin));
  } catch (error) {
    logger.error('Callback error:', error);
    return NextResponse.redirect(
      new URL('/auth/login?error=callback_error', requestUrl.origin)
    );
  }
}
