'use client';

import { createBrowserClient } from '@autamedica/auth';
import { useEffect } from 'react';

/**
 * SessionSync Component
 *
 * Handles session synchronization in development when redirecting from Auth Hub.
 * In localhost, cookies don't work across different ports, so we pass tokens via URL.
 *
 * This component:
 * 1. Checks for access_token and refresh_token in URL params
 * 2. Sets them in Supabase client (using the app singleton)
 * 3. Cleans up the URL
 * 4. Allows the app to continue normally
 */
export function SessionSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');

    if (accessToken && refreshToken) {
      // Use the singleton client — never create a raw client that bypasses the singleton
      const supabase = createBrowserClient();

      // Set the session with the tokens from URL
      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(() => {
        // Clean up URL by removing tokens
        urlParams.delete('access_token');
        urlParams.delete('refresh_token');

        const newUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '');
        window.history.replaceState({}, '', newUrl);
      });
    }
  }, []);

  return null;
}
