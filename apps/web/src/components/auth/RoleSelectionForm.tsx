'use client';

import { useEffect, useState } from 'react';
import {
  getRoleDisplayName,
  getRoleDescription,
  AVAILABLE_ROLES,
} from '@autamedica/shared';
import type { UserRole } from '@autamedica/shared';
import { getBrowserSupabaseClient } from '../../lib/supabase-browser';
import { AuthCard } from './AuthCard';
import { AuthButton } from './AuthButton';
import { AuthLogo } from './AuthLogo';

function getRoleIcon(role: UserRole) {
  const cls = 'w-6 h-6';
  switch (role) {
    case 'doctor':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 8.172V5L8 4z" />
        </svg>
      );
    case 'patient':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    case 'company_admin':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    default:
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
  }
}

export function RoleSelectionForm() {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loginHref, setLoginHref] = useState('/auth/login');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnTo = params.get('returnTo');
    setLoginHref(returnTo ? `/auth/login?returnTo=${encodeURIComponent(returnTo)}` : '/auth/login');
  }, []);

  const handleContinue = async () => {
    if (!selectedRole) return;
    setIsLoading(true);
    const currentParams = new URLSearchParams(window.location.search);
    const returnTo = currentParams.get('returnTo');

    const supabase = getBrowserSupabaseClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (session) {
      // User is already authenticated — save role and redirect to portal via callback
      await supabase.auth.updateUser({ data: { role: selectedRole } });
      // Re-fetch session to get updated tokens after metadata change
      const { data: { session: fresh } } = await supabase.auth.getSession();
      if (fresh) {
        const params = new URLSearchParams({
          access_token: fresh.access_token,
          refresh_token: fresh.refresh_token,
          role: selectedRole,
        });
        if (returnTo) {
          params.set('returnTo', returnTo);
        }
        window.location.href = `/auth/callback?${params.toString()}`;
        return;
      }
    }

    // Not authenticated yet — go to login with role pre-selected
    const loginParams = new URLSearchParams({ role: selectedRole });
    if (returnTo) {
      loginParams.set('returnTo', returnTo);
    }
    window.location.href = `/auth/login?${loginParams.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <AuthLogo size="md" />
        <h1 className="text-2xl font-bold text-[var(--au-text-primary)] mb-2">
          ¿Cómo vas a usar AutaMédica?
        </h1>
        <p className="text-sm text-[var(--au-text-secondary)]">
          Elegí tu perfil para continuar
        </p>
      </div>

      <div className="space-y-3">
        {AVAILABLE_ROLES.map((role) => (
          <AuthCard
            key={role}
            onClick={() => setSelectedRole(role)}
            selected={selectedRole === role}
            icon={getRoleIcon(role)}
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-[var(--au-text-primary)] mb-1">
                  {getRoleDisplayName(role)}
                </h3>
                <p className="text-sm text-[var(--au-text-secondary)] leading-snug">
                  {getRoleDescription(role)}
                </p>
              </div>
              {selectedRole === role && (
                <div className="flex-shrink-0 ml-3">
                  <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </AuthCard>
        ))}
      </div>

      <AuthButton
        onClick={handleContinue}
        disabled={!selectedRole || isLoading}
        variant="primary"
        fullWidth
      >
        {selectedRole && !isLoading && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        )}
        <span>
          {isLoading
            ? 'Redirigiendo...'
            : selectedRole
              ? `Continuar como ${getRoleDisplayName(selectedRole)}`
              : 'Continuar'}
        </span>
      </AuthButton>

      <div className="text-center pt-2">
        <p className="text-sm text-[var(--au-text-tertiary)]">
          ¿Ya tenés cuenta?{' '}
          <a href={loginHref} className="text-[var(--au-accent)] hover:text-[var(--au-text-primary)] font-medium transition-colors">
            Iniciar sesión
          </a>
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 pt-4 border-t border-[var(--au-border)]">
        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-xs text-[var(--au-text-tertiary)]">Conexión segura y cifrada</span>
      </div>
    </div>
  );
}
