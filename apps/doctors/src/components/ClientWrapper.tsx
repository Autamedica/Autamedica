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

    const checkAuth = async () => {
      try {
        const supabase = createBrowserClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
          redirectToLogin();
          return;
        }

        // Check if the session is expired
        const now = Math.floor(Date.now() / 1000);
        if (session.expires_at && session.expires_at < now) {
          // Clear stale session to prevent other components from using it
          await supabase.auth.signOut({ scope: 'local' });
          redirectToLogin();
        }
      } catch {
        redirectToLogin();
      }
    };

    checkAuth();
  }, []);

  return (
    <>
      <SessionSync />
      {children}
    </>
  )
}
