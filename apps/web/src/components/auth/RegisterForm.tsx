'use client';

import { useState, useEffect } from 'react';
import { getRoleDisplayName, isValidUserRole, resolveRoleFromPortal } from '@autamedica/shared';
import type { UserRole } from '@autamedica/shared';
import { getBrowserSupabaseClient } from '../../lib/supabase-browser';
import { AuthLogo } from './AuthLogo';
import { AuthButton } from './AuthButton';
import { AuthAlert } from './AuthAlert';

export function RegisterForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlRole = urlParams.get('role');
    const urlPortal = urlParams.get('portal')?.toLowerCase();
    const roleFromPortal = resolveRoleFromPortal(urlPortal);
    const resolvedRole = urlRole && isValidUserRole(urlRole)
      ? urlRole
      : roleFromPortal ?? null;
    setRole(resolvedRole);
    setReturnTo(urlParams.get('returnTo'));

    if (!resolvedRole || !isValidUserRole(resolvedRole)) {
      window.location.href = '/auth/select-role';
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    if (!role) {
      setError('Debes seleccionar un rol antes de registrarte');
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      setIsLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
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

      setMessage('Te hemos enviado un enlace de confirmación a tu email. Revisa tu bandeja de entrada para activar tu cuenta.');
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Error al crear la cuenta';
      if (errorMsg.includes('User already registered')) {
        setError('Este email ya está registrado. ¿Quieres iniciar sesión?');
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!role || !isValidUserRole(role)) {
    return null;
  }

  const roleDisplayName = getRoleDisplayName(role);

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <AuthLogo size="md" />
        <h1 className="text-2xl font-bold text-[var(--au-text-primary)] mb-2">
          Únete a AutaMedica
        </h1>

        {/* Role Badge */}
        <div className="inline-flex items-center px-4 py-2 bg-[var(--au-hover)] rounded-full border-2 border-[var(--au-border)] mb-2">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
          <span className="text-sm font-medium text-[var(--au-text-secondary)]">
            Registro como {roleDisplayName}
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
      {error && <AuthAlert tone="error">{error}</AuthAlert>}

      {/* Success Message */}
      {message && <AuthAlert tone="success">{message}</AuthAlert>}

      {/* Registration Form */}
      {!message && (
        <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isLoading}>
          <div>
            <label htmlFor="reg-email" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              Correo electrónico
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
              placeholder="tu@email.com"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              Contraseña
            </label>
            <input
              id="reg-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={isLoading}
              aria-invalid={password.length > 0 && password.length < 6}
              className="w-full px-4 py-3 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50"
              placeholder="Mínimo 6 caracteres"
            />
            {password.length > 0 && password.length < 6 && (
              <p className="mt-2 text-xs text-yellow-400 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Necesitas al menos 6 caracteres
              </p>
            )}
          </div>

          <div>
            <label htmlFor="reg-confirm" className="block text-sm font-medium text-[var(--au-text-secondary)] mb-2">
              Confirmar contraseña
            </label>
            <input
              id="reg-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={isLoading}
              aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
              className="w-full px-4 py-3 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50"
              placeholder="Repite tu contraseña"
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="mt-2 text-xs text-red-400 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Las contraseñas no coinciden
              </p>
            )}
          </div>

          <AuthButton
            disabled={isLoading || !email || password.length < 6 || password !== confirmPassword}
            loading={isLoading}
            variant="primary"
            fullWidth
            type="submit"
          >
            <span>Crear mi cuenta</span>
          </AuthButton>
        </form>
      )}

      {/* Footer */}
      <div className="pt-6 border-t-2 border-[var(--au-border)] text-center space-y-4">
        <p className="text-sm text-[var(--au-text-tertiary)]">
          ¿Ya tienes cuenta en AutaMedica?
        </p>
        <a
          href={`/auth/login?role=${role}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`}
          className="inline-flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-[var(--au-text-secondary)] hover:text-[var(--au-text-primary)] bg-[var(--au-hover)] hover:bg-[var(--au-hover-border)] border-2 border-[var(--au-border)] hover:border-[var(--au-accent)] rounded-xl transition-all duration-200"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
          </svg>
          Iniciar sesión
        </a>

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
