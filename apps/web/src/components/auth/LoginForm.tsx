'use client';

import { useState, useEffect } from 'react';
import {
  getRoleDisplayName,
  isValidUserRole,
} from '@autamedica/shared';
import type { UserRole } from '@autamedica/shared';
import { getBrowserSupabaseClient } from '../../lib/supabase-browser';
import { AuthLogo } from './AuthLogo';
import { AuthButton } from './AuthButton';

/**
 * Redirect URL by role (browser-safe, no process.env dependency).
 * In production, the callback handles cross-domain redirect.
 * In dev/local, we redirect to the callback which resolves the final URL.
 */
function getRedirectByRole(role: UserRole): string {
  return `/auth/callback?role=${role}`;
}

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRole = urlParams.get('role') as UserRole | null;
    const urlReturnTo = urlParams.get('returnTo');

    setRole(urlRole);
    setReturnTo(urlReturnTo);

    if (!urlRole || !isValidUserRole(urlRole)) {
      window.location.href = '/auth/select-role';
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = getBrowserSupabaseClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message === 'Invalid login credentials'
          ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
          : signInError.message);
        setIsSubmitting(false);
        return;
      }

      // Update user metadata with role if needed
      if (role) {
        await supabase.auth.updateUser({
          data: { role },
        });
      }

      // Redirect to target via callback (handles cross-domain + token passing)
      if (returnTo) {
        window.location.href = returnTo;
      } else if (role) {
        window.location.href = getRedirectByRole(role);
      } else {
        window.location.href = '/';
      }
    } catch (err) {
      setError('Error inesperado. Intenta de nuevo.');
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = getBrowserSupabaseClient();
      const origin = window.location.origin;
      const redirectTo = `${origin}/auth/callback${role ? `?role=${role}` : ''}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (oauthError) {
        setError(oauthError.message || 'Error al conectar con Google');
        setIsSubmitting(false);
      }
      // OAuth redirect happens automatically
    } catch {
      setError('Error inesperado con Google. Intenta de nuevo.');
      setIsSubmitting(false);
    }
  };

  // Don't render until we have a valid role
  if (!role || !isValidUserRole(role)) {
    return null;
  }

  const roleDisplayName = getRoleDisplayName(role);

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <AuthLogo size="md" />
        <h1 className="text-2xl font-bold text-[var(--au-text-primary)] mb-2">
          Bienvenido de vuelta
        </h1>

        {/* Role Badge */}
        <div className="inline-flex items-center px-4 py-2 bg-[var(--au-hover)] rounded-full border-2 border-[var(--au-border)] mb-2">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
          <span className="text-sm font-medium text-[var(--au-text-secondary)]">
            Acceso como {roleDisplayName}
          </span>
        </div>

        <p className="text-[var(--au-text-secondary)] text-sm">
          ¿No es tu rol?{' '}
          <a href="/auth/select-role" className="text-[var(--au-accent)] hover:text-[var(--au-text-primary)] font-medium transition-colors">
            Cambiar aquí
          </a>
        </p>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="bg-red-500/10 border-2 border-red-500/30 rounded-lg p-4">
          <div className="flex items-center">
            <svg className="w-5 h-5 text-red-400 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Google Sign In */}
      <button
        onClick={handleGoogleSignIn}
        disabled={isSubmitting}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-[var(--au-hover)] hover:bg-[var(--au-hover-border)] border-2 border-[var(--au-border)] hover:border-[var(--au-accent)] rounded-xl text-[var(--au-text-primary)] font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Continuar con Google
      </button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full h-px bg-gradient-to-r from-transparent via-[var(--au-border)] to-transparent" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 py-1 text-[var(--au-text-secondary)] bg-[var(--au-surface)] rounded-full border-2 border-[var(--au-border)]">
            o continúa con email
          </span>
        </div>
      </div>

      {/* Email/Password Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isSubmitting}
            className="w-full px-4 py-3 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50"
            placeholder="tu@email.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isSubmitting}
            className="w-full px-4 py-3 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50"
            placeholder="••••••••"
          />
        </div>

        <AuthButton
          onClick={() => {}}
          disabled={isSubmitting}
          variant="primary"
          fullWidth
          type="submit"
        >
          <span>{isSubmitting ? 'Iniciando sesión...' : 'Iniciar Sesión'}</span>
        </AuthButton>
      </form>

      {/* Footer */}
      <div className="pt-6 border-t-2 border-[var(--au-border)] text-center space-y-4">
        <p className="text-sm text-[var(--au-text-tertiary)]">
          ¿No tienes cuenta en AutaMedica?
        </p>
        <a
          href={`/auth/register?role=${role}`}
          className="inline-flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-[var(--au-text-secondary)] hover:text-[var(--au-text-primary)] bg-[var(--au-hover)] hover:bg-[var(--au-hover-border)] border-2 border-[var(--au-border)] hover:border-[var(--au-accent)] rounded-xl transition-all duration-200"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
          Crear cuenta nueva
        </a>

        <div className="flex justify-center text-xs text-[var(--au-text-tertiary)]">
          <a href="/auth/forgot-password" className="hover:text-[var(--au-accent)] transition-colors">
            ¿Olvidaste tu contraseña?
          </a>
        </div>

        <div className="flex items-center justify-center text-xs text-[var(--au-text-tertiary)]">
          <svg className="w-4 h-4 mr-1.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          Conexión segura y cifrada
        </div>
      </div>
    </div>
  );
}
