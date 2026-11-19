'use client';

import { useState, useEffect } from 'react';
import { resetPasswordForEmail } from '../../lib/auth/service';
import { getPasswordRecoveryRequestRedirectUrl } from '../../lib/auth/password-recovery';
import { AuthLogo } from './AuthLogo';
import { AuthButton } from './AuthButton';
import { AuthAlert } from './AuthAlert';
import { getClientI18n } from '../../i18n/index';
import type { Locale } from '../../i18n/index';

export function ForgotPasswordForm({ locale = 'es' }: { locale?: Locale }) {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const { t } = getClientI18n(locale);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await resetPasswordForEmail(
        email,
        getPasswordRecoveryRequestRedirectUrl(new URL(window.location.href))
      );

      if (!result.ok) {
        setError(result.errorMessage ?? 'Error al enviar el enlace de recuperación');
        return;
      }

      setMessage(t('auth.recoveryEmailSent'));
      setCooldown(60);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al enviar el enlace de recuperación';
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <AuthLogo size="md" />
        <h1 className="text-2xl font-bold text-[var(--au-text-primary)] mb-2">
          {t('auth.recoverAccess')}
        </h1>
        <p className="text-sm text-[var(--au-text-secondary)]">
          {t('auth.recoverSubtitle')}
        </p>
      </div>

      {/* Error Alert */}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      {/* Success Message */}
      {message && <AuthAlert tone="success">{message}</AuthAlert>}

      {/* Form */}
      {!message && (
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              {t('auth.registeredEmail')}
            </label>
            <div className="relative">
              <input
                id="forgot-email"
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
              {email && email.includes('@') && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>
          </div>

          <AuthButton
            disabled={isLoading || !email || cooldown > 0}
            loading={isLoading}
            variant="primary"
            fullWidth
            type="submit"
          >
            <span>{cooldown > 0 ? `${t('auth.resendIn')} ${cooldown}${t('auth.seconds')}` : t('auth.sendRecoveryLink')}</span>
          </AuthButton>
        </form>
      )}

      {/* Footer */}
      <div className="pt-6 border-t-2 border-[var(--au-border)] text-center space-y-4">
        <p className="text-sm text-[var(--au-text-tertiary)]">
          {t('auth.rememberPassword')}
        </p>
        <a
          href="/auth/login"
          className="inline-flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-[var(--au-text-secondary)] hover:text-[var(--au-text-primary)] bg-[var(--au-hover)] hover:bg-[var(--au-hover-border)] border-2 border-[var(--au-border)] hover:border-[var(--au-accent)] rounded-xl transition-all duration-200"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          {t('auth.backToLogin')}
        </a>

        <div className="flex items-center justify-center text-xs text-[var(--au-text-tertiary)]">
          <svg className="w-4 h-4 mr-1.5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          {t('common.secureConnection')}
        </div>
      </div>
    </div>
  );
}
