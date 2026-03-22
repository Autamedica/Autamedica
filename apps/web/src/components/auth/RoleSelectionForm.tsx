'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EntryRole } from '../../lib/auth-flow';
import {
  ROLE_ENTRIES,
  buildAuthPath,
  buildRoleAuthPath,
  resolveEntryRoleFromParams,
} from '../../lib/auth-flow';
import { getBrowserSupabaseClient } from '../../lib/supabase-browser';
import { AuthCard } from './AuthCard';
import { AuthButton } from './AuthButton';
import { AuthLogo } from './AuthLogo';
import { getClientI18n } from '../../i18n/index';
import type { Locale } from '../../i18n/index';

function getRoleIcon(role: EntryRole) {
  const cls = 'h-6 w-6';
  switch (role) {
    case 'doctor':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
      );
    case 'patient':
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" strokeWidth={2} />
        </svg>
      );
    default:
      return (
        <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 21V7l8-4v18" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V11l-6-4" />
        </svg>
      );
  }
}

export function RoleSelectionForm({ locale = 'es' }: { locale?: Locale }) {
  const [selectedRole, setSelectedRole] = useState<EntryRole | null>(null);
  const [returnTo, setReturnTo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { t } = getClientI18n(locale);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleFromParams = resolveEntryRoleFromParams(params);
    const returnToParam = params.get('returnTo');

    if (roleFromParams) {
      setSelectedRole(roleFromParams);
    }
    setReturnTo(returnToParam);
  }, []);

  const loginHref = useMemo(
    () => buildAuthPath('login', { role: selectedRole ?? undefined, returnTo }),
    [selectedRole, returnTo]
  );

  const PRIVILEGED_ROLES = new Set(['admin', 'platform_admin', 'organization_admin']);

  const handleContinue = async () => {
    if (!selectedRole) {
      return;
    }

    setIsLoading(true);
    const supabase = getBrowserSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const currentRole = typeof user.user_metadata?.role === 'string' ? user.user_metadata.role : undefined;

      // Never overwrite privileged roles from the UI
      if (currentRole && PRIVILEGED_ROLES.has(currentRole)) {
        const callbackUrl = new URL('/auth/callback', window.location.origin);
        if (returnTo) callbackUrl.searchParams.set('returnTo', returnTo);
        window.location.href = callbackUrl.toString();
        return;
      }

      if (currentRole !== selectedRole) {
        await supabase.auth.updateUser({ data: { role: selectedRole } });
      }

      const callbackParams = new URLSearchParams({ role: selectedRole });
      if (returnTo) callbackParams.set('returnTo', returnTo);
      window.location.href = `/auth/callback?${callbackParams.toString()}`;
      return;
    }

    window.location.href = buildAuthPath('login', { role: selectedRole, returnTo });
  };

  const getRoleLabel = (role: EntryRole): string => {
    if (role === 'patient') return t('roles.patient.label');
    if (role === 'doctor') return t('roles.doctor.label');
    return t('roles.company_admin.label');
  };

  const getRoleDescription = (role: EntryRole): string => {
    if (role === 'patient') return t('roles.patient.description');
    if (role === 'doctor') return t('roles.doctor.description');
    return t('roles.company_admin.description');
  };

  return (
    <div className="space-y-6">
      <div className="mb-2 text-center">
        <AuthLogo size="md" />
        <h1 className="mb-2 text-2xl font-bold text-[var(--au-text-primary)]">
          {t('auth.chooseProfile')}
        </h1>
        <p className="text-sm text-[var(--au-text-secondary)]">
          {t('auth.chooseProfileSubtitle')}
        </p>
      </div>

      <div className="space-y-3">
        {ROLE_ENTRIES.map((entry) => (
          <AuthCard
            key={entry.role}
            onClick={() => setSelectedRole(entry.role)}
            selected={selectedRole === entry.role}
            icon={getRoleIcon(entry.role)}
            accentColor={entry.accent}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="mb-1 text-base font-bold text-[var(--au-text-primary)]">
                  {getRoleLabel(entry.role)}
                </h3>
                <p className="text-sm leading-snug text-[var(--au-text-secondary)]">
                  {getRoleDescription(entry.role)}
                </p>
              </div>
              {selectedRole === entry.role && (
                <div className="ml-2 shrink-0">
                  <div
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ background: entry.accent }}
                  >
                    <svg className="h-4 w-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>
          </AuthCard>
        ))}
      </div>

      <AuthButton onClick={handleContinue} disabled={!selectedRole || isLoading} variant="primary" fullWidth>
        {selectedRole && !isLoading && (
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        )}
        <span>{isLoading ? t('auth.preparingAccess') : t('auth.continueToLogin')}</span>
      </AuthButton>

      <div className="rounded-xl border-2 border-[var(--au-border)] bg-[var(--au-hover)]/40 p-3">
        <p className="mb-2 text-xs uppercase tracking-[0.06em] text-[var(--au-text-tertiary)]">
          {t('auth.directAccess')}
        </p>
        <div className="flex flex-wrap gap-2">
          {ROLE_ENTRIES.map((entry) => (
            <a
              key={`direct-${entry.role}`}
              href={buildRoleAuthPath('login', entry.role, returnTo)}
              className="inline-flex min-h-9 items-center justify-center rounded-full border border-[var(--au-border)] px-3 text-xs font-semibold text-[var(--au-text-secondary)] transition-colors hover:text-[var(--au-text-primary)]"
            >
              {getRoleLabel(entry.role)}
            </a>
          ))}
        </div>
      </div>

      <div className="pt-2 text-center">
        <p className="text-sm text-[var(--au-text-tertiary)]">
          {t('auth.alreadyHaveAccountQ')}{' '}
          <a href={loginHref} className="font-medium text-[var(--au-accent)] transition-colors hover:text-[var(--au-text-primary)]">
            {t('auth.signIn')}
          </a>
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 border-t border-[var(--au-border)] pt-4">
        <svg className="h-4 w-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-xs text-[var(--au-text-tertiary)]">{t('common.secureConnection')}</span>
      </div>
    </div>
  );
}
