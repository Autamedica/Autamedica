import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { isProduction, ensureClientEnv, logger, getClientEnvOrDefault } from '@autamedica/shared';

function getSafeReturnTo(returnTo: string | null, currentOrigin: string): URL | null {
  if (!returnTo) {
    return null;
  }

  try {
    const candidate = returnTo.startsWith('/') && !returnTo.startsWith('//')
      ? new URL(returnTo, currentOrigin)
      : new URL(returnTo);

    return candidate.origin === currentOrigin ? candidate : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const access_token = requestUrl.searchParams.get('access_token');
  const refresh_token = requestUrl.searchParams.get('refresh_token');
  const returnTo = requestUrl.searchParams.get('returnTo');

  const authBaseUrl = isProduction()
    ? getClientEnvOrDefault('NEXT_PUBLIC_APP_URL', 'https://www.autamedica.com')
    : getClientEnvOrDefault('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');

  if (!access_token || !refresh_token) {
    return NextResponse.redirect(
      new URL(`${authBaseUrl}/auth/select-role`, requestUrl.origin)
    );
  }

  try {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      ensureClientEnv('NEXT_PUBLIC_SUPABASE_URL'),
      ensureClientEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
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

    const { error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      logger.error('Error setting session in companies callback:', error);
      return NextResponse.redirect(
        new URL(`${authBaseUrl}/auth/login?error=${encodeURIComponent(error.message)}&role=company_admin`, requestUrl.origin)
      );
    }

    const safeReturnTo = getSafeReturnTo(returnTo, requestUrl.origin);
    return NextResponse.redirect(safeReturnTo ?? new URL('/', requestUrl.origin));
  } catch (error) {
    logger.error('Companies callback error:', error);
    return NextResponse.redirect(
      new URL(`${authBaseUrl}/auth/login?error=callback_error&role=company_admin`, requestUrl.origin)
    );
  }
}
