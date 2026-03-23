/**
 * Cliente Supabase para browser.
 * Delega al singleton de @autamedica/auth para evitar múltiples instancias de GoTrueClient.
 */
import { createBrowserClient } from '@autamedica/auth';

export function getBrowserSupabaseClient() {
  if (typeof window === 'undefined') {
    throw new Error('getBrowserSupabaseClient can only be called in the browser');
  }
  return createBrowserClient();
}
