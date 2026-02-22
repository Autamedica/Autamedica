'use client';

import { useEffect, useMemo, useState } from 'react';
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

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<EntryRole | undefined>(undefined);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resolvedRole = resolveEntryRoleFromParams(params);
    const returnToParam = params.get('returnTo');

    setRole(resolvedRole);
    setReturnTo(returnToParam);

    let active = true;

    const bootstrap = async () => {
      try {
        const supabase = getBrowserSupabaseClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (!active) {
          return;
        }

        if (session?.access_token && session?.refresh_token) {
          const callbackUrl = new URL('/auth/callback', window.location.origin);
          if (resolvedRole) {
            callbackUrl.searchParams.set('role', resolvedRole);
          }
          if (returnToParam) {
            callbackUrl.searchParams.set('returnTo', returnToParam);
          }
          window.location.replace(callbackUrl.toString());
          return;
        }
      } catch {
        // Ignore bootstrap errors and show the login form.
      }

      if (active) {
        setIsCheckingSession(false);
      }
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  const registerHref = useMemo(
    () => buildAuthPath('register', { role, returnTo }),
    [role, returnTo]
  );
  const selectRoleHref = useMemo(
    () => buildAuthPath('select-role', { returnTo }),
    [returnTo]
  );
  const forgotPasswordHref = useMemo(
    () => buildAuxHref('/auth/forgot-password', role, returnTo),
    [role, returnTo]
  );
  const roleContext = role ? getRoleEntry(role) : undefined;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = getBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(
          signInError.message === 'Invalid login credentials'
            ? 'Credenciales incorrectas. Revisa tu correo y tu contraseña.'
            : signInError.message
        );
        setIsSubmitting(false);
        return;
      }

      const callbackUrl = new URL('/auth/callback', window.location.origin);
      if (role) {
        callbackUrl.searchParams.set('role', role);
      }
      if (returnTo) {
        callbackUrl.searchParams.set('returnTo', returnTo);
      }

      window.location.href = callbackUrl.toString();
    } catch {
      setError('No pudimos iniciar sesión. Intenta nuevamente.');
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = getBrowserSupabaseClient();
      const callbackUrl = new URL('/auth/callback', window.location.origin);
      if (role) {
        callbackUrl.searchParams.set('role', role);
      }
      if (returnTo) {
        callbackUrl.searchParams.set('returnTo', returnTo);
      }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl.toString(),
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });

      if (oauthError) {
        setError(oauthError.message || 'Error al conectar con Google.');
        setIsSubmitting(false);
      }
    } catch {
      setError('Error inesperado con Google. Intenta nuevamente.');
      setIsSubmitting(false);
    }
  };

  if (isCheckingSession) {
    return (
      <div className="space-y-6 text-center">
        <AuthLogo size="md" />
        <h1 className="text-2xl font-bold text-[var(--au-text-primary)]">Preparando tu acceso</h1>
        <p className="text-sm text-[var(--au-text-secondary)]">
          Estamos validando tu sesión para evitar pasos innecesarios.
        </p>
        <div className="flex justify-center">
          <span className="inline-flex h-9 w-9 animate-spin rounded-full border-2 border-[var(--au-border)] border-t-[var(--au-accent)]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-2 text-center">
        <AuthLogo size="md" />
        <h1 className="mb-2 text-2xl font-bold text-[var(--au-text-primary)]">Bienvenido de vuelta</h1>
        <p className="text-sm text-[var(--au-text-secondary)]">Inicia sesión y entra directo a tu portal.</p>
      </div>

      {roleContext ? (
        <div className="rounded-xl border-2 border-[var(--au-border)] bg-[var(--au-hover)]/45 p-3">
          <p className="text-xs uppercase tracking-[0.08em] text-[var(--au-text-tertiary)]">Perfil seleccionado</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--au-text-primary)]">
              Continuar como {roleContext.label}
            </p>
            <a href={selectRoleHref} className="text-xs font-medium text-[var(--au-accent)] hover:text-[var(--au-text-primary)]">
              Cambiar perfil
            </a>
          </div>
        </div>
      ) : (
        <AuthAlert tone="info">
          Puedes iniciar sesión sin perfil, pero elegir uno mejora el redireccionamiento automático.
        </AuthAlert>
      )}

      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      <div className="flex flex-wrap gap-2">
        {ROLE_ENTRIES.map((entry) => {
          const isCurrent = role === entry.role;
          return (
            <a
              key={`role-${entry.role}`}
              href={buildAuthPath('login', { role: entry.role, returnTo })}
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

      <button
        type="button"
        onClick={handleGoogleSignIn}
        disabled={isSubmitting}
        className="w-full rounded-xl border-2 border-[var(--au-border)] bg-[var(--au-hover)] px-6 py-3 font-medium text-[var(--au-text-primary)] transition-all duration-200 hover:border-[var(--au-accent)] hover:bg-[var(--au-hover-border)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="inline-flex items-center justify-center gap-3">
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continuar con Google
        </span>
      </button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--au-border)] to-transparent" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="rounded-full border-2 border-[var(--au-border)] bg-[var(--au-surface)] px-4 py-1 text-[var(--au-text-secondary)]">
            o continúa con email
          </span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isSubmitting}>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-[var(--au-text-secondary)]">
            Correo electrónico
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
            aria-invalid={Boolean(error)}
            className="w-full rounded-xl border-2 border-[var(--au-border)] bg-[var(--au-hover)] px-4 py-3 text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] disabled:opacity-50"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium text-[var(--au-text-secondary)]">
              Contraseña
            </label>
            <a href={forgotPasswordHref} className="text-xs text-[var(--au-text-tertiary)] transition-colors hover:text-[var(--au-accent)]">
              ¿Olvidaste tu contraseña?
            </a>
          </div>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="current-password"
            disabled={isSubmitting}
            aria-invalid={Boolean(error)}
            className="w-full rounded-xl border-2 border-[var(--au-border)] bg-[var(--au-hover)] px-4 py-3 text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] disabled:opacity-50"
            placeholder="••••••••"
          />
        </div>

        <AuthButton disabled={isSubmitting} variant="primary" fullWidth type="submit">
          <span>{isSubmitting ? 'Iniciando sesión...' : 'Iniciar sesión'}</span>
        </AuthButton>
      </form>

      <div className="space-y-4 border-t-2 border-[var(--au-border)] pt-6 text-center">
        <p className="text-sm text-[var(--au-text-tertiary)]">¿No tienes cuenta en AutaMedica?</p>
        <a
          href={registerHref}
          className="inline-flex w-full items-center justify-center rounded-xl border-2 border-[var(--au-border)] bg-[var(--au-hover)] px-4 py-3 text-sm font-medium text-[var(--au-text-secondary)] transition-all duration-200 hover:border-[var(--au-accent)] hover:bg-[var(--au-hover-border)] hover:text-[var(--au-text-primary)]"
        >
          <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Crear cuenta nueva
        </a>

        <div className="flex items-center justify-center text-xs text-[var(--au-text-tertiary)]">
          <svg className="mr-1.5 h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Conexión segura y cifrada
        </div>
      </div>
    </div>
  );
}
