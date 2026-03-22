import { es } from './es';
import { pt } from './pt';
import type { TranslationDict } from './es';

export type { TranslationDict } from './es';
export type Locale = 'es' | 'pt';

/** Cookie que persiste la preferencia del usuario */
export const LOCALE_COOKIE = 'au-locale';

/** Países cuyo idioma principal es el portugués */
export const PT_COUNTRIES = new Set([
  'BR', 'PT', 'AO', 'MZ', 'CV', 'GW', 'ST', 'TL',
]);

// ── Deep merge ────────────────────────────────────────────────────────────────
// Combina el diccionario base (es) con los overrides parciales (pt).
// Solo aplica las claves explícitamente definidas en el override.

function deepMerge<T extends object>(base: T, override: object): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override) as Array<keyof typeof override>) {
    const baseVal = (base as Record<string, unknown>)[key as string];
    const overrideVal = (override as Record<string, unknown>)[key as string];
    if (
      overrideVal !== undefined &&
      typeof baseVal === 'object' &&
      baseVal !== null &&
      !Array.isArray(baseVal) &&
      typeof overrideVal === 'object' &&
      overrideVal !== null &&
      !Array.isArray(overrideVal)
    ) {
      result[key as string] = deepMerge(
        baseVal as object,
        overrideVal as object
      );
    } else if (overrideVal !== undefined) {
      result[key as string] = overrideVal;
    }
  }
  return result as T;
}

const dictionaries: Record<Locale, TranslationDict> = {
  es,
  pt: deepMerge(es, pt as object) as TranslationDict,
};

// ── Dot-path type helper ──────────────────────────────────────────────────────
// Genera el tipo string de todas las claves dot-notation válidas del diccionario.
// Ej: 'auth.emailLabel' | 'roles.patient.title' | ...

type DotPaths<T, Prefix extends string = ''> = T extends object
  ? {
      [K in keyof T & string]: T[K] extends object
        ? DotPaths<T[K], `${Prefix}${Prefix extends '' ? '' : '.'}${K}`>
        : `${Prefix}${Prefix extends '' ? '' : '.'}${K}`;
    }[keyof T & string]
  : never;

export type TranslationKey = DotPaths<TranslationDict>;

// ── Resolver de valor anidado ─────────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== 'object' || current === null) return path;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : path;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Retorna las utilidades de i18n para un locale dado.
 * Para uso en archivos .astro (servidor) e islands React.
 *
 * @example
 * const { t, dict } = getI18n(locale);
 * t('auth.emailLabel')          // → 'Email Institucional' | 'E-mail Institucional'
 * dict.landing.authLayout.testimonials  // → array de testimonios traducidos
 */
export function getI18n(locale: Locale) {
  const dict = dictionaries[locale];
  return {
    t: (key: TranslationKey): string =>
      getNestedValue(dict as unknown as Record<string, unknown>, key),
    dict,
    locale,
  };
}

/** Alias para claridad en islands React */
export const getClientI18n = getI18n;

// ── Detección de locale ───────────────────────────────────────────────────────

/**
 * Detecta el locale del usuario usando la siguiente prioridad:
 * 1. Cookie `au-locale` (preferencia guardada)
 * 2. Header `CF-IPCountry` de Cloudflare (cero latencia)
 * 3. Header `Accept-Language` del navegador
 * 4. Default: 'es'
 *
 * Usado EXCLUSIVAMENTE en el middleware de Astro (servidor).
 */
export function detectLocale(
  cookieHeader: string | null,
  cfIpCountry: string | null,
  acceptLanguage: string | null
): Locale {
  // 1. Preferencia guardada en cookie
  if (cookieHeader) {
    const match = cookieHeader.match(/au-locale=([^;]+)/);
    const cookieLocale = match?.[1]?.trim();
    if (cookieLocale === 'es' || cookieLocale === 'pt') return cookieLocale;
  }

  // 2. Geolocalización por IP (header de Cloudflare)
  if (cfIpCountry && PT_COUNTRIES.has(cfIpCountry.toUpperCase())) {
    return 'pt';
  }

  // 3. Preferencia del navegador
  if (acceptLanguage) {
    const langs = acceptLanguage
      .split(',')
      .map((l) => l.split(';')[0].trim().toLowerCase());
    for (const lang of langs) {
      if (lang.startsWith('pt')) return 'pt';
      if (lang.startsWith('es')) return 'es';
    }
  }

  // 4. Default
  return 'es';
}

export { es, pt };
