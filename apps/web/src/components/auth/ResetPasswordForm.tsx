'use client';

import { useState, useEffect } from 'react';
import {
  initializePasswordRecoverySession,
  updatePassword,
  verifyPasswordRecoveryToken,
} from '../../lib/auth/service';
import {
  getPasswordRecoveryTokenHash,
  hasPasswordRecoveryCallback,
} from '../../lib/auth/password-recovery';
import { meetsPasswordMinimum, MIN_PASSWORD_LENGTH } from '../../lib/auth/password-policy';
import { AuthLogo } from './AuthLogo';
import { AuthButton } from './AuthButton';
import { AuthAlert } from './AuthAlert';
import { getClientI18n } from '../../i18n/index';
import type { Locale } from '../../i18n/index';

export function ResetPasswordForm({ locale = 'es' }: { locale?: Locale }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<'checking' | 'awaiting_confirmation' | 'valid' | 'invalid'>('checking');
  const [recoveryTokenHash, setRecoveryTokenHash] = useState<string | null>(null);
  const [isVerifyingRecovery, setIsVerifyingRecovery] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const { t } = getClientI18n(locale);

  useEffect(() => {
    let isMounted = true;
    const callbackUrl = new URL(window.location.href);

    const tokenHash = getPasswordRecoveryTokenHash(callbackUrl);
    if (tokenHash) {
      // Do not redeem the single-use token on page load: email security
      // scanners may prefetch this URL. Verify only after the user taps.
      setRecoveryTokenHash(tokenHash);
      setLinkStatus('awaiting_confirmation');
      return () => {
        isMounted = false;
      };
    }

    if (!hasPasswordRecoveryCallback(callbackUrl)) {
      setLinkStatus('invalid');
      setError(t('auth.invalidLink'));
      return () => {
        isMounted = false;
      };
    }

    // This call creates the browser client immediately. With detectSessionInUrl
    // enabled, Supabase exchanges the PKCE code before getSession() resolves.
    // The service only accepts the PASSWORD_RECOVERY event, not an old login
    // session, so a stale or unrelated session cannot unlock this form.
    void initializePasswordRecoverySession()
      .then((result) => {
        if (!isMounted) return;

        if (!result.ok) {
          setLinkStatus('invalid');
          setError(t('auth.invalidLink'));
          return;
        }

        setLinkStatus('valid');
        setError(null);
      })
      .catch(() => {
        if (!isMounted) return;
        setLinkStatus('invalid');
        setError(t('auth.invalidLink'));
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const handleConfirmRecoveryLink = async () => {
    if (!recoveryTokenHash || isVerifyingRecovery) return;

    setIsVerifyingRecovery(true);
    setError(null);

    try {
      const result = await verifyPasswordRecoveryToken(recoveryTokenHash);
      if (!result.ok) {
        setLinkStatus('invalid');
        setError(t('auth.invalidLink'));
        return;
      }

      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete('token_hash');
      cleanUrl.searchParams.delete('type');
      window.history.replaceState(
        {},
        document.title,
        `${cleanUrl.pathname}${cleanUrl.search}${cleanUrl.hash}`,
      );
      setRecoveryTokenHash(null);
      setLinkStatus('valid');
    } catch {
      setLinkStatus('invalid');
      setError(t('auth.invalidLink'));
    } finally {
      setIsVerifyingRecovery(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    if (password !== confirmPassword) {
      setError(t('auth.passwordsDoNotMatch'));
      setIsLoading(false);
      return;
    }

    if (!meetsPasswordMinimum(password)) {
      setError(t('auth.resetPasswordMinLength'));
      setIsLoading(false);
      return;
    }

    try {
      const result = await updatePassword(password);

      if (!result.ok) {
        setError(result.errorMessage ?? 'Error al actualizar la contraseña');
        return;
      }

      setMessage(t('auth.passwordUpdated'));

      setTimeout(() => {
        window.location.href = '/auth/login';
      }, 2000);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al actualizar la contraseña';
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
          {t('auth.newPassword')}
        </h1>
        <p className="text-sm text-[var(--au-text-secondary)]">
          {t('auth.newPasswordSubtitle')}
        </p>
      </div>

      {linkStatus === 'checking' && (
        <div
          role="status"
          aria-label={t('auth.newPasswordSubtitle')}
          className="flex justify-center py-4"
        >
          <svg className="h-6 w-6 animate-spin text-[var(--au-accent)]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {linkStatus === 'awaiting_confirmation' && (
        <div className="space-y-4">
          <p className="text-sm text-center text-[var(--au-text-secondary)]">
            {t('auth.recoveryLinkReady')}
          </p>
          <AuthButton
            onClick={handleConfirmRecoveryLink}
            loading={isVerifyingRecovery}
            disabled={isVerifyingRecovery}
            fullWidth
          >
            {isVerifyingRecovery ? t('auth.verifyingRecoveryLink') : t('auth.confirmRecoveryLink')}
          </AuthButton>
        </div>
      )}

      {/* Error Alert */}
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      {/* Success Message */}
      {message && <AuthAlert tone="success">{message}</AuthAlert>}

      {/* Reset Form */}
      {linkStatus === 'valid' && !message && (
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              {t('auth.newPasswordLabel')}
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                disabled={isLoading}
                aria-invalid={password.length > 0 && !meetsPasswordMinimum(password)}
                className="w-full px-4 py-3 pr-12 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50"
                placeholder={t('auth.resetPasswordMinHint')}
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
            {password.length > 0 && !meetsPasswordMinimum(password) && (
              <p className="mt-2 text-xs text-yellow-400 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                {t('auth.resetPasswordNeedMin')}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="confirm-new-password" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              {t('auth.confirmPasswordLabel')}
            </label>
            <div className="relative">
              <input
                id="confirm-new-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
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
            disabled={isLoading || !meetsPasswordMinimum(password) || password !== confirmPassword}
            loading={isLoading}
            variant="primary"
            fullWidth
            type="submit"
          >
            <span>{t('auth.updatePassword')}</span>
          </AuthButton>
        </form>
      )}

      {/* Request new link if invalid */}
      {linkStatus === 'invalid' && (
        <a
          href="/auth/forgot-password"
          className="inline-flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-[var(--au-text-secondary)] hover:text-[var(--au-text-primary)] bg-[var(--au-hover)] hover:bg-[var(--au-hover-border)] border-2 border-[var(--au-border)] hover:border-[var(--au-accent)] rounded-xl transition-all duration-200"
        >
          {t('auth.requestNewLink')}
        </a>
      )}

      {/* Footer */}
      <div className="pt-6 border-t-2 border-[var(--au-border)] text-center space-y-4">
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
          {t('auth.updateSecure')}
        </div>
      </div>
    </div>
  );
}
