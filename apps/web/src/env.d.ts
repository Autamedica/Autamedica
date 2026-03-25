/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly PUBLIC_SIGNALING_URL?: string;
  readonly PUBLIC_APP_URL: string;
  readonly PUBLIC_DOCTORS_URL: string;
  readonly PUBLIC_PATIENTS_URL: string;
  readonly PUBLIC_COMPANIES_URL: string;
  readonly PUBLIC_ADMIN_URL: string;
  readonly PUBLIC_LANDING_COPY_VARIANT?: string;
  readonly PUBLIC_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    session: import('@supabase/supabase-js').Session | null;
    supabase: import('@supabase/supabase-js').SupabaseClient;
    locale: import('./i18n/index').Locale;
  }
}
