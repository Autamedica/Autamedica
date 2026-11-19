'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { fetchApi } from '@/lib/api-client';
import { usePatientSession } from '@/hooks/patients/usePatientSession';
import { updatePassword } from '@/lib/auth/service';
import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthButton } from '@/components/auth/AuthButton';
import {

  Eye,
  EyeOff,
  KeyRound,
  Bell,
  Shield,
  Trash2,
  ExternalLink,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Password Change Section                                           */
/* ------------------------------------------------------------------ */

function ChangePasswordSection({ isPortuguese }: { isPortuguese: boolean }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (newPassword.length < 6) {
      setError(isPortuguese ? 'A senha deve ter pelo menos 6 caracteres.' : 'La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(isPortuguese ? 'As senhas não coincidem.' : 'Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const result = await updatePassword(newPassword);
      if (!result.ok) {
        setError(result.errorMessage ?? (isPortuguese ? 'Erro ao atualizar a senha.' : 'Error al actualizar la contraseña.'));
        return;
      }
      setSuccess(isPortuguese ? 'Senha atualizada com sucesso.' : 'Contraseña actualizada correctamente.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : (isPortuguese ? 'Erro inesperado.' : 'Error inesperado.'));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full px-4 py-3 pr-12 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <KeyRound className="h-5 w-5 text-sky-600" />
        <h2 className="text-lg font-semibold text-slate-900">
          {isPortuguese ? 'Alterar senha' : 'Cambiar contraseña'}
        </h2>
      </div>

      {error && <div className="mb-4"><AuthAlert tone="error">{error}</AuthAlert></div>}
      {success && <div className="mb-4"><AuthAlert tone="success">{success}</AuthAlert></div>}

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        {/* New password */}
        <div>
          <label
            htmlFor="settings-new-pw"
            className="block text-sm font-medium text-[var(--au-text-secondary)] mb-1"
          >
            {isPortuguese ? 'Nova senha' : 'Nueva contraseña'}
          </label>
          <div className="relative">
            <input
              id="settings-new-pw"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={loading}
              className={inputClass}
              placeholder={isPortuguese ? "Mínimo 6 caracteres" : "Mínimo 6 caracteres"}
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              disabled={loading}
              aria-label={showNew ? (isPortuguese ? 'Ocultar senha' : 'Ocultar contraseña') : (isPortuguese ? 'Mostrar senha' : 'Mostrar contraseña')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--au-text-tertiary)] hover:text-[var(--au-text-secondary)] transition-colors"
            >
              {showNew ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Confirm password */}
        <div>
          <label
            htmlFor="settings-confirm-pw"
            className="block text-sm font-medium text-[var(--au-text-secondary)] mb-1"
          >
            {isPortuguese ? 'Confirmar senha' : 'Confirmar contraseña'}
          </label>
          <div className="relative">
            <input
              id="settings-confirm-pw"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="new-password"
              disabled={loading}
              className={inputClass}
              placeholder={isPortuguese ? "Repetir senha" : "Repetir contraseña"}
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              disabled={loading}
              aria-label={showConfirm ? (isPortuguese ? 'Ocultar senha' : 'Ocultar contraseña') : (isPortuguese ? 'Mostrar senha' : 'Mostrar contraseña')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--au-text-tertiary)] hover:text-[var(--au-text-secondary)] transition-colors"
            >
              {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1 text-xs text-red-400">{isPortuguese ? "As senhas não coincidem." : "Las contraseñas no coinciden."}</p>
          )}
        </div>

        <AuthButton
          type="submit"
          variant="primary"
          loading={loading}
          disabled={loading || newPassword.length < 6 || newPassword !== confirmPassword}
        >
          {isPortuguese ? 'Atualizar senha' : 'Actualizar contraseña'}
        </AuthButton>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Notifications Section                                             */
/* ------------------------------------------------------------------ */

function NotificationsSection({ isPortuguese }: { isPortuguese: boolean }) {
  const STORAGE_KEY = 'autamedica:notification-prefs';
  const [prefs, setPrefs] = useState({ email: true, push: true });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const serverPrefs = await fetchApi<{ email: boolean; push: boolean }>('/api/patients/notification-preferences');
        if (!active) return;
        const next = { email: serverPrefs.email, push: serverPrefs.push };
        setPrefs(next);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        try {
          const cached = localStorage.getItem(STORAGE_KEY);
          if (active && cached) {
            const parsed = JSON.parse(cached) as { email?: unknown; push?: unknown };
            if (typeof parsed.email === 'boolean' && typeof parsed.push === 'boolean') {
              setPrefs({ email: parsed.email, push: parsed.push });
            }
          }
        } catch { /* Optimistic cache only; Supabase remains authoritative. */ }
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  async function toggle(key: 'email' | 'push') {
    const previous = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setSaving(true);
    try {
      const saved = await fetchApi<{ email: boolean; push: boolean }>('/api/patients/notification-preferences', {
        method: 'PATCH',
        body: next,
      });
      const confirmed = { email: saved.email, push: saved.push };
      setPrefs(confirmed);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(confirmed));
    } catch {
      setPrefs(previous);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(previous));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Bell className="h-5 w-5 text-sky-600" />
        <h2 className="text-lg font-semibold text-slate-900">{isPortuguese ? 'Notificações' : 'Notificaciones'}</h2>
      </div>
      <div className="max-w-md space-y-4">
        <ToggleRow
          label={isPortuguese ? 'Notificações por e-mail' : 'Notificaciones por email'}
          description={isPortuguese ? 'Lembretes de consultas, resultados e novidades.' : 'Recordatorios de citas, resultados y novedades.'}
          checked={prefs.email}
          onChange={() => void toggle('email')}
          disabled={saving}
        />
        <ToggleRow
          label={isPortuguese ? 'Notificações push' : 'Notificaciones push'}
          description={isPortuguese ? 'Alertas em tempo real no navegador.' : 'Alertas en tiempo real en tu navegador.'}
          checked={prefs.push}
          onChange={() => void toggle('push')}
          disabled={saving}
        />
      </div>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-[var(--au-text-primary)]">{label}</p>
        <p className="text-xs text-[var(--au-text-tertiary)]">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] ${
          checked ? 'bg-[var(--au-accent)]' : 'bg-[var(--au-border)]'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Privacy Section                                                   */
/* ------------------------------------------------------------------ */

function PrivacySection({ isPortuguese }: { isPortuguese: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-[var(--au-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--au-text-primary)]">
          {isPortuguese ? 'Privacidade' : 'Privacidad'}
        </h2>
      </div>

      <div className="space-y-3 max-w-md">
        <a
          href="/privacidad"
          className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 transition-colors hover:bg-slate-50"
        >
          {isPortuguese ? 'Política de privacidade' : 'Política de privacidad'}
          <ExternalLink className="w-4 h-4 text-[var(--au-text-tertiary)]" />
        </a>
        <a
          href="/eliminar-cuenta"
          className="flex items-center justify-between rounded-xl border border-[var(--au-border)] px-4 py-3 text-sm text-[var(--au-text-primary)] hover:bg-[var(--au-hover)] transition-colors"
        >
          {isPortuguese ? 'Solicitar exclusão da conta' : 'Solicitar eliminación de cuenta'}
          <ExternalLink className="w-4 h-4 text-[var(--au-text-tertiary)]" />
        </a>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Danger Zone                                                       */
/* ------------------------------------------------------------------ */

function DangerZoneSection({ isPortuguese }: { isPortuguese: boolean }) {
  return (
    <section className="rounded-2xl border border-red-300 bg-red-50/50 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 className="w-5 h-5 text-red-600" />
        <h2 className="text-lg font-semibold text-red-700">{isPortuguese ? 'Zona de perigo' : 'Zona de peligro'}</h2>
      </div>

      <p className="text-sm text-[var(--au-text-secondary)] mb-4">
        {isPortuguese ? 'Esta ação é irreversível. Todos os seus dados médicos e da conta serão excluídos.' : 'Esta acción es irreversible. Se eliminarán todos tus datos médicos y de cuenta.'}
      </p>

      <a
        href="/eliminar-cuenta"
        className="inline-flex items-center gap-2 rounded-xl border-2 border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        {isPortuguese ? 'Excluir minha conta' : 'Eliminar mi cuenta'}
      </a>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */

export default function PatientSettingsPage() {
  const { patient } = usePatientSession();
  const isPortuguese = patient?.careCountry === 'BR' || (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt'));
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <section className="bg-[#0284C7] px-6 lg:px-12 pt-10 pb-16">
        <div className="max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6">
            <Shield className="w-3.5 h-3.5" />
            {isPortuguese ? 'Conta e privacidade' : 'Cuenta y privacidad'}
          </div>
          <h1 className="text-4xl lg:text-5xl text-white mb-4 leading-tight">{isPortuguese ? 'Configurações' : 'Configuración'}</h1>
          <p className="text-lg text-white/60 max-w-lg">
            {isPortuguese ? 'Gerencie sua conta, notificações e privacidade' : 'Administra tu cuenta, notificaciones y privacidad'}
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 lg:px-12 -mt-8 pb-32 space-y-6">
        <ChangePasswordSection isPortuguese={isPortuguese} />
        <NotificationsSection isPortuguese={isPortuguese} />
        <PrivacySection isPortuguese={isPortuguese} />
        <DangerZoneSection isPortuguese={isPortuguese} />
      </div>
    </div>
  );
}
