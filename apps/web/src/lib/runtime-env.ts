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

export function resolveServiceRoleKey(runtimeEnv?: RuntimeEnvRecord): string | undefined {
  primeRuntimeEnv(runtimeEnv);

  return (
    readFirst(runtimeEnv, ['SUPABASE_SERVICE_ROLE_KEY']) ??
    readCached(['SUPABASE_SERVICE_ROLE_KEY']) ??
    import.meta.env.SUPABASE_SERVICE_ROLE_KEY ??
    readProcess(['SUPABASE_SERVICE_ROLE_KEY'])
  );
}

export function resolvePublicClientEnv(runtimeEnv?: RuntimeEnvRecord): {
  publicSupabaseUrl: string;
  publicSupabaseAnonKey: string;
} {
  const { publicSupabaseUrl, publicSupabaseAnonKey } = resolvePublicSupabaseEnv(runtimeEnv);

  return {
    publicSupabaseUrl: publicSupabaseUrl ?? '',
    publicSupabaseAnonKey: publicSupabaseAnonKey ?? '',
  };
}
