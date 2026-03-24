'use client';

import { createBrowserClient } from '@autamedica/auth';
import { logger } from '@autamedica/shared';
import { useEffect } from 'react';

/**
 * SessionSync Component
 *
 * Handles session synchronization in development when redirecting from Auth Hub.
 * In localhost, cookies don't work across different ports, so we pass tokens via URL.
 *
 * This component:
 * 1. Checks for access_token and refresh_token in URL params
 * 2. Sets them in Supabase client
 * 3. Cleans up the URL
 * 4. Allows the app to continue normally
 */
// JWT format: three base64url segments separated by dots
const JWT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function SessionSync() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');

    // Always clean tokens from URL immediately to minimize exposure
    if (accessToken || refreshToken) {
      urlParams.delete('access_token');
      urlParams.delete('refresh_token');
      const cleanUrl = window.location.pathname + (urlParams.toString() ? `?${urlParams.toString()}` : '');
      window.history.replaceState({}, '', cleanUrl);
    }

    // Only process tokens that match JWT format
    if (accessToken && refreshToken && JWT_PATTERN.test(accessToken) && JWT_PATTERN.test(refreshToken)) {
      const supabase = createBrowserClient();

      supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      }).then(() => {
        logger.info('[SessionSync] Sesión sincronizada desde URL');
      });
    }
  }, []);

  return null;
}
