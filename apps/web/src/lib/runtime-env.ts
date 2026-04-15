import { getServerEnvOrDefault } from '@autamedica/shared';

type RuntimeEnvRecord = Record<string, unknown> | null | undefined;

let cachedRuntimeEnv: Record<string, string> = {};

function readStringValue(source: RuntimeEnvRecord, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readFirst(source: RuntimeEnvRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = readStringValue(source, key);
    if (value) return value;
  }
  return undefined;
}

function readCached(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = cachedRuntimeEnv[key];
    if (value) return value;
  }
  return undefined;
}

function readProcess(keys: string[]): string | undefined {
  for (const key of keys) {
    // PUBLIC_ variables are managed by Astro/Vite and shouldn't be accessed via the strict getServerEnvOrDefault
    // which is reserved for server-side secrets. During build/SSR, we check process.env directly if available.
    if (key.startsWith('PUBLIC_') || key.startsWith('NEXT_PUBLIC_')) {
      // eslint-disable-next-line no-restricted-properties -- PUBLIC_ vars must be read from process.env directly; getServerEnvOrDefault is for secrets only
      const value = typeof process !== 'undefined' ? process.env[key] : undefined;
      if (typeof value === 'string' && value.length > 0) return value;
      continue;
    }

    const value = getServerEnvOrDefault(key);
    if (typeof value === 'string' && value.length > 0) return value;
  }

  return undefined;
}

/**
 * Read a single env var from the Cloudflare runtime cache.
 * Use after primeRuntimeEnv() has been called by middleware.
 */
export function getRuntimeEnvValue(key: string): string | undefined {
  return cachedRuntimeEnv[key] || undefined;
}

export function resetRuntimeEnvCache(): void {
  cachedRuntimeEnv = {};
}

export function primeRuntimeEnv(runtimeEnv?: RuntimeEnvRecord): void {
  if (!runtimeEnv) return;

  cachedRuntimeEnv = {
    ...cachedRuntimeEnv,
    ...Object.fromEntries(
      Object.entries(runtimeEnv).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === 'string' && entry[1].length > 0,
      ),
    ),
  };
}

export function resolvePublicSupabaseEnv(runtimeEnv?: RuntimeEnvRecord): {
  publicSupabaseUrl?: string;
  publicSupabaseAnonKey?: string;
} {
  primeRuntimeEnv(runtimeEnv);

  const publicSupabaseUrl =
    readFirst(runtimeEnv, ['PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) ??
    readCached(['PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']) ??
    import.meta.env.PUBLIC_SUPABASE_URL ??
    readProcess(['PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']);

  const publicSupabaseAnonKey =
    readFirst(runtimeEnv, [
      'PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ]) ??
    readCached([
      'PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ]) ??
    import.meta.env.PUBLIC_SUPABASE_ANON_KEY ??
    readProcess([
      'PUBLIC_SUPABASE_ANON_KEY',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_ANON_KEY',
    ]);

  return { publicSupabaseUrl, publicSupabaseAnonKey };
}

export function resolvePublicSentryDsn(runtimeEnv?: RuntimeEnvRecord): string | undefined {
  primeRuntimeEnv(runtimeEnv);

  return (
    readFirst(runtimeEnv, ['PUBLIC_SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN']) ??
    readCached(['PUBLIC_SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN']) ??
    import.meta.env.PUBLIC_SENTRY_DSN ??
    import.meta.env.NEXT_PUBLIC_SENTRY_DSN ??
    readProcess(['PUBLIC_SENTRY_DSN', 'NEXT_PUBLIC_SENTRY_DSN'])
  );
}

export function resolveServiceRoleKey(runtimeEnv?: RuntimeEnvRecord): string | undefined {
  primeRuntimeEnv(runtimeEnv);

  return (
    readFirst(runtimeEnv, ['SUPABASE_SERVICE_ROLE_KEY']) ??
    readCached(['SUPABASE_SERVICE_ROLE_KEY']) ??
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY ??
    readProcess(['SUPABASE_SERVICE_ROLE_KEY'])
  );
}

export function resolveCloudflareCallsEnv(runtimeEnv?: RuntimeEnvRecord): {
  appId?: string;
  appSecret?: string;
} {
  primeRuntimeEnv(runtimeEnv);

  const appId =
    readFirst(runtimeEnv, ['CLOUDFLARE_CALLS_APP_ID']) ??
    readCached(['CLOUDFLARE_CALLS_APP_ID']) ??
    import.meta.env.CLOUDFLARE_CALLS_APP_ID ??
    readProcess(['CLOUDFLARE_CALLS_APP_ID']);

  const appSecret =
    readFirst(runtimeEnv, ['CLOUDFLARE_CALLS_APP_SECRET']) ??
    readCached(['CLOUDFLARE_CALLS_APP_SECRET']) ??
    import.meta.env.CLOUDFLARE_CALLS_APP_SECRET ??
    readProcess(['CLOUDFLARE_CALLS_APP_SECRET']);

  return { appId, appSecret };
}

export function resolveGuestSecret(runtimeEnv?: RuntimeEnvRecord): string | undefined {
  primeRuntimeEnv(runtimeEnv);

  return (
    readFirst(runtimeEnv, ['GUEST_TOKEN_SECRET']) ??
    readCached(['GUEST_TOKEN_SECRET']) ??
    import.meta.env.GUEST_TOKEN_SECRET ??
    readProcess(['GUEST_TOKEN_SECRET'])
  );
}

export function resolvePublicClientEnv(runtimeEnv?: RuntimeEnvRecord): {
  publicSupabaseUrl: string;
  publicSupabaseAnonKey: string;
  publicSentryDsn: string;
} {
  const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(runtimeEnv);
  const publicSentryDsn = resolvePublicSentryDsn(runtimeEnv);

  return {
    publicSupabaseUrl: publicSupabaseUrl ?? '',
    publicSupabaseAnonKey: publicSupabaseAnonKey ?? '',
    publicSentryDsn: publicSentryDsn ?? '',
  };
}
