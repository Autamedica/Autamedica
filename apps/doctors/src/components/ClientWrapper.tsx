'use client'

import { createBrowserClient } from '@autamedica/auth/client';
import { getClientEnvOrDefault, isProduction } from '@autamedica/shared';
import { useEffect, useRef, type ReactNode } from 'react';
import { SessionSync } from './SessionSync';

/** Prevent multiple redirect navigations */
let _redirecting = false;

const PUBLIC_PATHS = ['/test-call', '/consultation', '/auth/callback'];

function isPublicPath(): boolean {
  if (typeof window === 'undefined') return false;
  return PUBLIC_PATHS.some(p =>
    window.location.pathname === p || window.location.pathname.startsWith(`${p}/`)
  );
}

function redirectToLogin(): void {
  if (_redirecting || isPublicPath()) return;
  _redirecting = true;
  const authOrigin = getClientEnvOrDefault(
    'NEXT_PUBLIC_APP_URL',
    isProduction() ? 'https://www.autamedica.com' : 'http://localhost:3000'
  );
  const loginUrl = new URL('/auth/login', authOrigin);
  loginUrl.searchParams.set('portal', 'doctors');
  loginUrl.searchParams.set('returnTo', window.location.href);
  window.location.href = loginUrl.toString();
}

interface ClientWrapperProps {
  children: ReactNode
}

export function ClientWrapper({ children }: ClientWrapperProps) {
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current || isPublicPath()) return;
    checkedRef.current = true;

    // Use onAuthStateChange instead of getSession() to avoid racing
    // with useAuthenticatedUser's own getSession() call. Both calling
    // getSession() concurrently with the no-op lock causes the Supabase
    // SDK to process a token refresh twice, leading to "Cannot read
    // properties of undefined (reading 'payload')" in the minified SDK.
    const supabase = createBrowserClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (!session) {
            redirectToLogin();
            return;
          }
          const now = Math.floor(Date.now() / 1000);
          if (session.expires_at && session.expires_at < now) {
            supabase.auth.signOut({ scope: 'local' }).then(() => redirectToLogin());
          }
        } else if (event === 'SIGNED_OUT') {
          redirectToLogin();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return (
    <>
      <SessionSync />
      {children}
    </>
  )
}
