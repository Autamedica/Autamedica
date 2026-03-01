export {
  getSupabaseBrowserClient,
  getSupabaseServerClient,
  getSupabaseClient,
} from '@autamedica/supabase-client';
export type { AppSupabaseClient as PatientsSupabaseClient } from '@autamedica/supabase-client';

// Exports for backwards compatibility
export {
  getSupabaseClient as createClient,
  getSupabaseBrowserClient as createBrowserClient,
} from '@autamedica/supabase-client';