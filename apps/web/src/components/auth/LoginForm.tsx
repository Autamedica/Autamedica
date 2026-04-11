'use client';

import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import type { EntryRole } from '../../lib/auth-flow';
import {
  ROLE_ENTRIES,
  buildAuthPath,
  resolveEntryRoleFromParams,
  resolveEntryRoleFromHostname,
} from '../../lib/auth-flow';
import {
  checkExistingSession,
  signInWithOAuth,
  signInWithPassword,
  signOutLocal,
} from '../../lib/auth/service';
import { getCanonicalAuthCallbackUrl } from '../../lib/auth-utils';
import { AuthLogo } from './AuthLogo';
import { AuthButton } from './AuthButton';
import { AuthAlert } from './AuthAlert';
import { getClientI18n } from '../../i18n/index';
import type { Locale } from '../../i18n/index';
import { logger } from '@autamedica/shared';

function buildAuxHref(path: string, role?: EntryRole, returnTo?: string | null): string {
  const params = new URLSearchParams();
  if (role) {
    params.set('role', role);
  }
  if (returnTo) {
    params.set('returnTo', returnTo);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function LoginForm({ locale = 'es' }: { locale?: Locale }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<EntryRole | undefined>(undefined);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [pendingRetry, setPendingRetry] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  const { t } = getClientI18n(locale);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resolvedRole = resolveEntryRoleFromParams(params) ?? resolveEntryRoleFromHostname(window.location.hostname);
    const returnToParam = params.get('returnTo');

    setRole(resolvedRole);
    setReturnTo(returnToParam);

    if (params.get('expired') === 'true') {
      setSessionExpired(true);
      // Clean the param from URL
      const clean = new URL(window.location.href);
      clean.searchParams.delete('expired');
      window.history.replaceState({}, '', clean.toString());
    }

    let active = true;

    // Safety timeout: never leave the user stuck on the loading screen.
    // If session validation takes longer than 8s (e.g. Supabase is slow or
    // the refresh token loop is already running), abort and show the form.
    const timeoutId = window.setTimeout(() => {
      if (active) setIsCheckingSession(false);
    }, 8000);

    const bootstrap = async () => {
      try {
        const errorParam = params.get('error');
        const retryParam = params.get('retry');

        // Si llegamos con un error param, mostrar mensaje amigable.
        if (errorParam) {
          await signOutLocal();
          clearTimeout(timeoutId);
          if (active) {
            setError(errorParam === 'pkce_failed' ? t('auth.pkceError') : t('auth.loginError'));
            setIsCheckingSession(false);
            if (retryParam === 'google') setPendingRetry(true);
          }
          return;
        }

        // Verificar sesión existente (local + server-side).
        const session = await checkExistingSession();

        if (!active) {
          clearTimeout(timeoutId);
          return;
        }

        if (!session.hasLocalSession || !session.isServerValid) {
          clearTimeout(timeoutId);
          if (active) setIsCheckingSession(false);
          return;
        }

        // Usuario autenticado — redirigir a callback para routing por rol.
        if (session.accessToken && session.refreshToken) {
          const callbackUrl = new URL(getCanonicalAuthCallbackUrl(window.location.origin));
          if (resolvedRole) callbackUrl.searchParams.set('role', resolvedRole);
          if (returnToParam) callbackUrl.searchParams.set('returnTo', returnToParam);
          clearTimeout(timeoutId);
          window.location.replace(callbackUrl.toString());
          return;
        }
      } catch {
        // Ignorar errores de bootstrap y mostrar el formulario.
      }

      clearTimeout(timeoutId);
      if (active) setIsCheckingSession(false);
    };

    void bootstrap();

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, []);

  const registerHref = useMemo(
    () => buildAuthPath('register', { role, returnTo }),
    [role, returnTo]
  );
  const forgotPasswordHref = useMemo(
    () => buildAuxHref('/auth/forgot-password', role, returnTo),
    [role, returnTo]
  );

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await signInWithPassword(email, password);

      if (!result.ok) {
        const isInvalidCredentials = result.errorMessage === 'Invalid login credentials';
        setError(isInvalidCredentials ? t('auth.wrongCredentials') : (result.errorMessage ?? t('auth.loginError')));
        if (isInvalidCredentials) setPassword('');
        setIsSubmitting(false);
        return;
      }

      const callbackUrl = new URL(getCanonicalAuthCallbackUrl(window.location.origin));
      if (role) callbackUrl.searchParams.set('role', role);
      if (returnTo) callbackUrl.searchParams.set('returnTo', returnTo);

      window.location.href = callbackUrl.toString();
    } catch (err) {
      logger.error('[LoginForm] signInWithPassword threw unexpectedly', { err: String(err) });
      setError(t('auth.loginError'));
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = useCallback(async () => {
    setIsSubmitting(true);
    setError(null);
    sessionStorage.removeItem('autamedica_pkce_retry');

    try {
      // OAuth callback MUST go through www.autamedica.com (the Supabase site_url)
      // so the PKCE code_verifier cookie is readable by the server doing the exchange.
      // After auth, the callback redirects to the correct subdomain based on role.
      const isProd = window.location.hostname.endsWith('.autamedica.com');
      const callbackUrl = new URL(getCanonicalAuthCallbackUrl(window.location.origin));
      if (role) callbackUrl.searchParams.set('role', role);
      const effectiveReturnTo = returnTo || (isProd ? window.location.origin + '/' : undefined);
      if (effectiveReturnTo) callbackUrl.searchParams.set('returnTo', effectiveReturnTo);

      // signInWithOAuth limpia el estado previo internamente (ver AuthService).
      const result = await signInWithOAuth('google', callbackUrl.toString());

      if (!result.ok) {
        setError(result.errorMessage || t('auth.googleError'));
        setIsSubmitting(false);
      }
    } catch (err) {
      logger.error('[LoginForm] signInWithOAuth threw unexpectedly', { err: String(err), provider: 'google', role });
      setError(t('auth.googleErrorUnexpected'));
      setIsSubmitting(false);
    }
  }, [role, returnTo, t]);

  // Clean URL params after PKCE failure — no auto-retry to avoid redirect loops.
  // The user sees the error and can click "Continuar con Google" manually.
  useEffect(() => {
    if (!pendingRetry) return;

    const clean = new URL(window.location.href);
    clean.searchParams.delete('error');
    clean.searchParams.delete('retry');
    window.history.replaceState({}, '', clean.toString());
    setPendingRetry(false);
  }, [pendingRetry]);

  const roleInfo: Record<string, { title: string; subtitle: string; icon: ReactNode; accent: string; buttonLabel: string }> = {
    patient: {
      title: t('roles.patient.title'),
      subtitle: t('roles.patient.subtitle'),
      accent: 'text-emerald-700',
      buttonLabel: t('roles.patient.buttonLabel'),
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    doctor: {
      title: t('roles.doctor.title'),
      subtitle: t('roles.doctor.subtitle'),
      accent: 'text-cyan-700',
      buttonLabel: t('roles.doctor.buttonLabel'),
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1a.3.3 0 1 0 .2-.7L4 10V4l.8-1.7zm14.4 0A.3.3 0 1 1 19 2h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1a.3.3 0 1 1-.2-.7l1.2-.3V4l-.8-1.7zM7 2h10l1 2v5l-1 2H7l-1-2V4l1-2z" />
          <path d="M12 11v8M9 22h6" />
        </svg>
      ),
    },
    pharmacist: {
      title: t('roles.pharmacist.title'),
      subtitle: t('roles.pharmacist.subtitle'),
      accent: 'text-emerald-800',
      buttonLabel: t('roles.pharmacist.buttonLabel'),
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M9 2h6l1 7H8L9 2z" />
          <rect x="5" y="9" width="14" height="13" rx="2" />
          <path d="M12 13v5M9.5 15.5h5" />
        </svg>
      ),
    },
    company_admin: {
      title: t('roles.company_admin.title'),
      subtitle: t('roles.company_admin.subtitle'),
      accent: 'text-slate-700',
      buttonLabel: t('roles.company_admin.buttonLabel'),
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        </svg>
      ),
    },
  };

  const currentRoleInfo = roleInfo[role] || roleInfo.patient;

  if (isCheckingSession) {
    return (
      <div className="flex flex-col items-center justify-center space-y-8 py-12 text-center animate-in fade-in duration-700">
        <div className="relative">
          <AuthLogo size="md" />
          <div className="absolute inset-x-0 -bottom-4 flex justify-center">
             <div className="h-1 w-12 bg-gradient-to-r from-transparent via-[var(--au-accent)] to-transparent opacity-50 blur-sm"></div>
          </div>
        </div>
        <div className="space-y-3">
          <p className="text-2xl font-bold tracking-tight text-[var(--au-text-primary)]">{t('auth.preparing')}</p>
          <p className="max-w-[280px] text-sm leading-relaxed text-[var(--au-text-secondary)]">
            {t('auth.preparingSubtitle')}
          </p>
        </div>
        <div className="relative flex h-12 w-12 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-[var(--au-accent)] opacity-20"></div>
          <span className="h-2 w-2 rounded-full bg-[var(--au-accent)]"></span>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 ${role === 'patient' ? 'theme-patient' : role === 'doctor' ? 'theme-doctor' : 'theme-company'}`}>
      <div className="text-center">
        {/* Portal Identifier Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--au-accent-soft)] border border-[var(--au-border)] mb-8 animate-in slide-in-from-top-2 duration-1000">
          <span className={`h-1.5 w-1.5 rounded-full ${currentRoleInfo.accent.replace('text-', 'bg-')} shadow-[0_0_8px_currentColor]`}></span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--au-text-secondary)]">{t('auth.accessMode')}</span>
        </div>

        <AuthLogo size="md" />

        {/* Role Segmented Picker - High Contrast */}
        <div role="tablist" aria-label="Portal de acceso" className="mt-10 grid grid-cols-4 gap-1 p-1 bg-[var(--au-surface)] border border-[var(--au-border)] rounded-2xl">
          {ROLE_ENTRIES.map((entry) => {
            const isCurrent = role === entry.role;
            const info = roleInfo[entry.role as string];
            return (
              <a
                key={`role-tab-${entry.role}`}
                href={buildAuthPath('login', { role: entry.role, returnTo })}
                role="tab"
                aria-selected={isCurrent}
                tabIndex={isCurrent ? 0 : -1}
                className={`flex flex-col items-center gap-2 py-3.5 rounded-xl transition-all ${
                  isCurrent
                    ? 'bg-[var(--au-accent-soft)] text-[var(--au-text-primary)] shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-[var(--au-border-hover)]'
                    : 'text-[var(--au-text-tertiary)] hover:text-[var(--au-text-secondary)]'
                }`}
              >
                <span className={isCurrent ? currentRoleInfo.accent : ''}>{info?.icon}</span>
                <span className="text-[10px] font-extrabold uppercase tracking-widest">{entry.shortLabel}</span>
              </a>
            );
          })}
        </div>

        <div className="mt-10 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--au-text-primary)]">
            {currentRoleInfo.title}
          </h1>
          <p className="text-sm text-[var(--au-text-secondary)]">
            {currentRoleInfo.subtitle}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-[var(--au-border)] bg-[var(--au-surface)] px-6 py-4 font-semibold text-[var(--au-text-primary)] transition-all hover:border-[var(--au-border-hover)] hover:bg-[var(--au-surface-hover)] active:scale-[0.98] disabled:opacity-50"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--au-accent-soft)] to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
          <svg className="relative h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="relative text-[var(--au-text-primary)]">{t('auth.continueWithGoogle')}</span>
        </button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--au-border)]" />
          </div>
        </div>

        {sessionExpired && (
          <AuthAlert tone="info">Tu sesión expiró. Por favor iniciá sesión de nuevo.</AuthAlert>
        )}
        {error && <AuthAlert tone="error">{error}</AuthAlert>}

        <form onSubmit={handleSubmit} className="space-y-5" aria-busy={isSubmitting}>
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-1">
              {t('auth.email')}
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              inputMode="email"
              disabled={isSubmitting}
              className="w-full rounded-2xl border border-[var(--au-border)] bg-[var(--au-surface)] px-5 py-4 text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] transition-all focus:border-[var(--au-accent)] focus:ring-4 focus:ring-[var(--au-accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--au-accent)] disabled:opacity-50"
              placeholder={t('auth.emailPlaceholder')}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <label htmlFor="password" className="text-sm font-medium text-[var(--au-text-secondary)]">
                {t('auth.password')}
              </label>
              <a href={forgotPasswordHref} className="text-[11px] font-bold text-[var(--au-accent)] hover:underline">
                {t('auth.recover')}
              </a>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                disabled={isSubmitting}
                className="w-full rounded-2xl border border-[var(--au-border)] bg-[var(--au-surface)] px-5 py-4 pr-14 text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] transition-all focus:border-[var(--au-accent)] focus:ring-4 focus:ring-[var(--au-accent-soft)] focus-visible:outline-2 focus-visible:outline-[var(--au-accent)] disabled:opacity-50"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                disabled={isSubmitting}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--au-text-tertiary)] hover:text-[var(--au-text-secondary)] transition-colors disabled:opacity-50"
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
          </div>

          <AuthButton disabled={isSubmitting} variant="primary" fullWidth type="submit" className="h-[60px] text-lg lg:text-base">
            <span>{isSubmitting ? t('auth.enterSession') : currentRoleInfo.buttonLabel}</span>
          </AuthButton>
        </form>
      </div>

      <div className="space-y-6 pt-6 text-center">
        <p className="text-xs text-[var(--au-text-tertiary)]">
          {t('auth.noAccount')}{' '}
          <a href={registerHref} className="font-bold text-[var(--au-text-primary)] hover:text-[var(--au-accent)]">
            {t('auth.startToday')}
          </a>
        </p>

        <div className="flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.1em] text-[var(--au-text-tertiary)]">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--au-success)] shadow-[0_0_8px_var(--au-accent-glow)]"></div>
          {t('common.secureConnection')}
        </div>
      </div>
    </div>
  );
}
