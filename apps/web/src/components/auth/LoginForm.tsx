'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
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

        // If we arrived with an error param, the previous session was invalid.
        // Clear local state to prevent a redirect loop.
        const errorParam = params.get('error');
        if (errorParam) {
          await supabase.auth.signOut({ scope: 'local' });
          if (active) setIsCheckingSession(false);
          return;
        }

        // Use getUser() instead of getSession() to verify the session
        // is actually valid server-side (network call), not just locally cached.
        const { data: { user }, error: userError } = await supabase.auth.getUser();

        if (!active) {
          return;
        }

        if (userError || !user) {
          // No valid session — clear any stale local data and show login form.
          await supabase.auth.signOut({ scope: 'local' });
          if (active) setIsCheckingSession(false);
          return;
        }

        // User is authenticated — redirect to callback for role routing.
        const { data: { session } } = await supabase.auth.getSession();
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

  const roleInfo: Record<string, { title: string; subtitle: string; icon: ReactNode; accent: string; buttonLabel: string }> = {
    patient: {
      title: 'Portal de Pacientes',
      subtitle: 'Gestiona tu salud con precisión y agilidad.',
      accent: 'text-emerald-400',
      buttonLabel: 'Entrar como Paciente',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      ),
    },
    doctor: {
      title: 'Portal Médico',
      subtitle: 'Infraestructura clínica de alto rendimiento.',
      accent: 'text-cyan-400',
      buttonLabel: 'Entrar como Médico',
      icon: (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h1a.3.3 0 1 0 .2-.7L4 10V4l.8-1.7zm14.4 0A.3.3 0 1 1 19 2h1a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-1a.3.3 0 1 1-.2-.7l1.2-.3V4l-.8-1.7zM7 2h10l1 2v5l-1 2H7l-1-2V4l1-2z" />
          <path d="M12 11v8M9 22h6" />
        </svg>
      ),
    },
    company: {
      title: 'Portal Corporativo',
      subtitle: 'Estrategias de bienestar para tu organización.',
      accent: 'text-slate-300',
      buttonLabel: 'Entrar como Empresa',
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
          <h1 className="text-2xl font-bold tracking-tight text-[var(--au-text-primary)]">Preparando tu acceso</h1>
          <p className="max-w-[280px] text-sm leading-relaxed text-[var(--au-text-secondary)]">
            Validando tu identidad para una conexión segura y sin fricciones.
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
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-8 animate-in slide-in-from-top-2 duration-1000">
          <span className={`h-1.5 w-1.5 rounded-full ${currentRoleInfo.accent.replace('text-', 'bg-')} shadow-[0_0_8px_currentColor]`}></span>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60">Modo de Acceso</span>
        </div>

        <AuthLogo size="md" />
        
        {/* Role Segmented Picker - High Contrast */}
        <div className="mt-10 grid grid-cols-3 gap-1 p-1 bg-black/40 border border-white/5 rounded-2xl">
          {ROLE_ENTRIES.map((entry) => {
            const isCurrent = role === entry.role;
            const info = roleInfo[entry.role as string];
            return (
              <a
                key={`role-tab-${entry.role}`}
                href={buildAuthPath('login', { role: entry.role, returnTo })}
                className={`flex flex-col items-center gap-2 py-3.5 rounded-xl transition-all ${
                  isCurrent
                    ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(0,0,0,0.5)] border border-white/10'
                    : 'text-white/30 hover:text-white/50'
                }`}
              >
                <span className={isCurrent ? currentRoleInfo.accent : ''}>{info?.icon}</span>
                <span className="text-[10px] font-extrabold uppercase tracking-widest">{entry.shortLabel}</span>
              </a>
            );
          })}
        </div>

        <div className="mt-10 space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {currentRoleInfo.title}
          </h1>
          <p className="text-sm text-white/50">
            {currentRoleInfo.subtitle}
          </p>
        </div>
      </div>

      <div className="space-y-6">
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={isSubmitting}
          className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-semibold text-white transition-all hover:border-white/20 hover:bg-white/10 active:scale-[0.98] disabled:opacity-50"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100"></div>
          <svg className="relative h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          <span className="relative">Continuar con Google</span>
        </button>

        <div className="relative py-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10 opacity-50" />
          </div>
        </div>

        {error && <AuthAlert tone="error">{error}</AuthAlert>}

        <form onSubmit={handleSubmit} className="space-y-5" aria-busy={isSubmitting}>
          <div className="space-y-2">
            <label htmlFor="email" className="ml-1 text-[11px] font-bold uppercase tracking-wider text-white/40">
              Email Institucional
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
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-white placeholder:text-white/20 transition-all focus:border-[var(--au-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--au-accent-soft)] disabled:opacity-50"
              placeholder="tu@email.com"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <label htmlFor="password" className="text-[11px] font-bold uppercase tracking-wider text-white/40">
                Contraseña
              </label>
              <a href={forgotPasswordHref} className="text-[11px] font-bold text-[var(--au-accent)] hover:underline">
                Recuperar
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
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-white placeholder:text-white/20 transition-all focus:border-[var(--au-accent)] focus:outline-none focus:ring-4 focus:ring-[var(--au-accent-soft)] disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          <AuthButton disabled={isSubmitting} variant="primary" fullWidth type="submit" className="h-[60px] text-lg lg:text-base">
            <span>{isSubmitting ? 'Iniciando fase...' : currentRoleInfo.buttonLabel}</span>
          </AuthButton>
        </form>
      </div>

      <div className="space-y-6 pt-6 text-center">
        <p className="text-xs text-white/40">
          ¿Sin cuenta?{' '}
          <a href={registerHref} className="font-bold text-white hover:text-[var(--au-accent)]">
            Empieza hoy
          </a>
        </p>

        <div className="flex items-center justify-center gap-2 text-[10px] font-medium uppercase tracking-[0.1em] text-white/20">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"></div>
          Infraestructura Bio-Segura
        </div>
      </div>
    </div>
  );
}



