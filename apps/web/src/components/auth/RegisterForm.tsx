'use client';

import { useState, useEffect } from 'react';
import type { EntryRole } from '../../lib/auth-flow';
import {
  ROLE_ENTRIES,
  buildAuthPath,
  getRoleEntry,
  resolveEntryRoleFromParams,
} from '../../lib/auth-flow';
import { getBrowserSupabaseClient } from '../../lib/supabase-browser';
import { AuthLogo } from './AuthLogo';
import { AuthButton } from './AuthButton';
import { AuthAlert } from './AuthAlert';
import { getClientI18n } from '../../i18n/index';
import type { Locale } from '../../i18n/index';

export function RegisterForm({ locale = 'es' }: { locale?: Locale }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<EntryRole | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { t } = getClientI18n(locale);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const resolvedRole = resolveEntryRoleFromParams(urlParams) ?? null;
    setRole(resolvedRole);
    setReturnTo(urlParams.get('returnTo'));

    if (!resolvedRole) {
      window.location.href = buildAuthPath('select-role', { returnTo: urlParams.get('returnTo') });
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    if (!role) {
      setError(t('auth.selectRoleFirst'));
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError(t('auth.minPasswordLength'));
      setIsLoading(false);
      return;
    }

    try {
      const supabase = getBrowserSupabaseClient();
      const callbackUrl = new URL('/auth/callback', window.location.origin);
      callbackUrl.searchParams.set('role', role);
      if (returnTo) {
        callbackUrl.searchParams.set('returnTo', returnTo);
      }
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
          data: { role },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setMessage(t('auth.emailConfirmation'));
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al crear la cuenta';
      if (errorMsg.includes('User already registered')) {
        setError(t('auth.emailAlreadyRegistered'));
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!role) {
    return null;
  }

  const roleDisplayName = getRoleEntry(role).label;
  const loginHref = buildAuthPath('login', { role, returnTo });
  const selectRoleHref = buildAuthPath('select-role', { returnTo });

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <AuthLogo size="md" />
        <h1 className="text-2xl font-bold text-[var(--au-text-primary)] mb-2">
          {t('auth.joinTitle')}
        </h1>

        {/* Role Badge */}
        <div className="inline-flex items-center px-4 py-2 bg-[var(--au-hover)] rounded-full border-2 border-[var(--au-border)] mb-2">
          <div className="w-2 h-2 bg-[var(--au-accent)] rounded-full mr-2 animate-pulse"></div>
          <span className="text-sm font-medium text-[var(--au-text-secondary)]">
            Registro como {roleDisplayName}
          </span>
        </div>

        <p className="text-[var(--au-text-secondary)] text-sm">
          {t('auth.notYourRole')}{' '}
          <a href={selectRoleHref} className="text-[var(--au-accent)] hover:text-[var(--au-text-primary)] font-medium transition-colors">
            {t('auth.changeHere')}
          </a>
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ROLE_ENTRIES.map((entry) => {
          const isCurrent = role === entry.role;
          return (
            <a
              key={`register-role-${entry.role}`}
              href={buildAuthPath('register', { role: entry.role, returnTo })}
              className={`inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-semibold transition-colors ${
                isCurrent
                  ? 'border-[var(--au-accent)] text-[var(--au-text-primary)]'
                  : 'border-[var(--au-border)] text-[var(--au-text-secondary)] hover:text-[var(--au-text-primary)]'
              }`}
            >
              {entry.shortLabel}
            </a>
          );
        })}
      </div>

      {/* Error Alert */}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      {/* Success Message */}
      {message && <AuthAlert tone="success">{message}</AuthAlert>}

      {/* Registration Form */}
      {!message && (
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              {t('auth.email')}
            </label>
            <input
              id="reg-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              disabled={isLoading}
              aria-invalid={Boolean(error)}
              className="w-full px-4 py-3 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50"
              placeholder={t('auth.emailPlaceholder')}
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              {t('auth.password')}
            </label>
            <div className="relative">
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isLoading}
                aria-invalid={password.length > 0 && password.length < 8}
                className="w-full px-4 py-3 pr-12 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50"
                placeholder={t('auth.passwordMinHint')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={isLoading}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--au-text-tertiary)] hover:text-[var(--au-text-secondary)] transition-colors disabled:opacity-50"
              >
                {showPassword ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {password.length > 0 && password.length < 8 && (
              <p className="mt-2 text-xs text-yellow-400 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {t('auth.needMinPassword')}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="reg-confirm" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              {t('auth.confirmPassword')}
            </label>
            <div className="relative">
              <input
                id="reg-confirm"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                disabled={isLoading}
                aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
                className="w-full px-4 py-3 pr-12 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50"
                placeholder={t('auth.confirmPasswordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                disabled={isLoading}
                aria-label={showConfirmPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--au-text-tertiary)] hover:text-[var(--au-text-secondary)] transition-colors disabled:opacity-50"
              >
                {showConfirmPassword ? (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {confirmPassword && password !== confirmPassword && (
              <p className="mt-2 text-xs text-red-400 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('auth.passwordsDoNotMatch')}
              </p>
            )}
          </div>

          <AuthButton
            disabled={isLoading || !email || password.length < 8 || password !== confirmPassword}
            loading={isLoading}
            variant="primary"
            fullWidth
            type="submit"
          >
            <span>{isLoading ? t('auth.creating') : t('auth.createAccount')}</span>
          </AuthButton>
        </form>
      )}

      {/* Footer */}
      <div className="pt-6 border-t-2 border-[var(--au-border)] text-center space-y-4">
        <p className="text-sm text-[var(--au-text-tertiary)]">
          {t('auth.alreadyHaveAccount')}
        </p>
        <a
          href={loginHref}
          className="inline-flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-[var(--au-text-secondary)] hover:text-[var(--au-text-primary)] bg-[var(--au-hover)] hover:bg-[var(--au-hover-border)] border-2 border-[var(--au-border)] hover:border-[var(--au-accent)] rounded-xl transition-all duration-200"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          {t('auth.signIn')}
        </a>

        <div className="flex items-center justify-center text-xs text-[var(--au-text-tertiary)]">
          <svg className="w-4 h-4 mr-1.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          {t('common.secureConnection')}
        </div>
      </div>
    </div>
  );
}
