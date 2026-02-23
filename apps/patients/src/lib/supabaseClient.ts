export {
  getSupabaseBrowserClient, getSupabaseClient, getSupabaseServerClient
} from '@autamedica/supabase-client';
export type { AppSupabaseClient as PatientsSupabaseClient } from '@autamedica/supabase-client';

// Exports for backwards compatibility
export {
  getSupabaseBrowserClient as createBrowserClient, getSupabaseClient as createClient
} from '@autamedica/supabase-client';
