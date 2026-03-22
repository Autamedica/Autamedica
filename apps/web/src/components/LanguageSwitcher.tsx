'use client';

import type { Locale } from '../i18n/index';
import { LOCALE_COOKIE } from '../i18n/index';

interface Props {
  currentLocale: Locale;
}

const LANG_LABELS: Record<Locale, string> = {
  es: 'ES',
  pt: 'PT',
};

export function LanguageSwitcher({ currentLocale }: Props) {
  const handleSwitch = (newLocale: Locale) => {
    if (newLocale === currentLocale) return;
    const secure = location.protocol === 'https:' ? '; secure' : '';
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${LOCALE_COOKIE}=${newLocale}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
    window.location.reload();
  };

  return (
    <div
      role="group"
      aria-label="Seleccionar idioma"
      className="flex items-center gap-0.5 rounded-lg border border-[var(--au-border)] bg-[var(--au-surface)] p-0.5"
    >
      {(Object.keys(LANG_LABELS) as Locale[]).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => handleSwitch(lang)}
          aria-pressed={currentLocale === lang}
          aria-label={`Cambiar a ${LANG_LABELS[lang]}`}
          className={`min-w-[32px] rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider transition-all ${
            currentLocale === lang
              ? 'bg-[var(--au-accent-soft)] text-[var(--au-accent)] shadow-sm'
              : 'text-[var(--au-text-tertiary)] hover:text-[var(--au-text-secondary)]'
          }`}
        >
          {LANG_LABELS[lang]}
        </button>
      ))}
    </div>
  );
}
