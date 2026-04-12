'use client';

import { useState, type FormEvent } from 'react';
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

function ChangePasswordSection() {
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

    if (newPassword.length < 8) {
      setError('La contrasena debe tener al menos 8 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Las contrasenas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const result = await updatePassword(newPassword);
      if (!result.ok) {
        setError(result.errorMessage ?? 'Error al actualizar la contrasena.');
        return;
      }
      setSuccess('Contrasena actualizada correctamente.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    'w-full px-4 py-3 pr-12 bg-[var(--au-hover)] border-2 border-[var(--au-border)] rounded-xl text-[var(--au-text-primary)] placeholder:text-[var(--au-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--au-accent)] focus:border-transparent transition-all disabled:opacity-50';

  return (
    <section className="rounded-2xl border border-[var(--au-border)] bg-[var(--au-surface)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <KeyRound className="w-5 h-5 text-[var(--au-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--au-text-primary)]">
          Cambiar contrasena
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
            Nueva contrasena
          </label>
          <div className="relative">
            <input
              id="settings-new-pw"
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              disabled={loading}
              className={inputClass}
              placeholder="Minimo 8 caracteres"
            />
            <button
              type="button"
              onClick={() => setShowNew((v) => !v)}
              disabled={loading}
              aria-label={showNew ? 'Ocultar contrasena' : 'Mostrar contrasena'}
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
            Confirmar contrasena
          </label>
          <div className="relative">
            <input
              id="settings-confirm-pw"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              disabled={loading}
              className={inputClass}
              placeholder="Repetir contrasena"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              disabled={loading}
              aria-label={showConfirm ? 'Ocultar contrasena' : 'Mostrar contrasena'}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--au-text-tertiary)] hover:text-[var(--au-text-secondary)] transition-colors"
            >
              {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="mt-1 text-xs text-red-400">Las contrasenas no coinciden.</p>
          )}
        </div>

        <AuthButton
          type="submit"
          variant="primary"
          loading={loading}
          disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
        >
          Actualizar contrasena
        </AuthButton>
      </form>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Notifications Section                                             */
/* ------------------------------------------------------------------ */

function NotificationsSection() {
  const STORAGE_KEY = 'autamedica:notification-prefs';

  function loadPrefs(): { email: boolean; push: boolean } {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* noop */ }
    return { email: true, push: true };
  }

  const [prefs, setPrefs] = useState(loadPrefs);

  function toggle(key: 'email' | 'push') {
    setPrefs((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <section className="rounded-2xl border border-[var(--au-border)] bg-[var(--au-surface)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-5 h-5 text-[var(--au-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--au-text-primary)]">
          Notificaciones
        </h2>
      </div>

      <div className="space-y-4 max-w-md">
        <ToggleRow
          label="Notificaciones por email"
          description="Recordatorios de citas, resultados y novedades."
          checked={prefs.email}
          onChange={() => toggle('email')}
        />
        <ToggleRow
          label="Notificaciones push"
          description="Alertas en tiempo real en tu navegador."
          checked={prefs.push}
          onChange={() => toggle('push')}
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
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
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

function PrivacySection() {
  return (
    <section className="rounded-2xl border border-[var(--au-border)] bg-[var(--au-surface)] p-6">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-[var(--au-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--au-text-primary)]">
          Privacidad
        </h2>
      </div>

      <div className="space-y-3 max-w-md">
        <a
          href="/privacidad"
          className="flex items-center justify-between rounded-xl border border-[var(--au-border)] px-4 py-3 text-sm text-[var(--au-text-primary)] hover:bg-[var(--au-hover)] transition-colors"
        >
          Politica de privacidad
          <ExternalLink className="w-4 h-4 text-[var(--au-text-tertiary)]" />
        </a>
        <a
          href="/eliminar-cuenta"
          className="flex items-center justify-between rounded-xl border border-[var(--au-border)] px-4 py-3 text-sm text-[var(--au-text-primary)] hover:bg-[var(--au-hover)] transition-colors"
        >
          Solicitar eliminacion de cuenta
          <ExternalLink className="w-4 h-4 text-[var(--au-text-tertiary)]" />
        </a>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Danger Zone                                                       */
/* ------------------------------------------------------------------ */

function DangerZoneSection() {
  return (
    <section className="rounded-2xl border border-red-300 bg-red-50/50 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Trash2 className="w-5 h-5 text-red-600" />
        <h2 className="text-lg font-semibold text-red-700">Zona de peligro</h2>
      </div>

      <p className="text-sm text-[var(--au-text-secondary)] mb-4">
        Esta accion es irreversible. Se eliminaran todos tus datos medicos y de cuenta.
      </p>

      <a
        href="/eliminar-cuenta"
        className="inline-flex items-center gap-2 rounded-xl border-2 border-red-300 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Eliminar mi cuenta
      </a>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */

export default function PatientSettingsPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-neutral-900 px-6 lg:px-12 pt-16 pb-20">
        <div className="max-w-7xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6">
            <Shield className="w-3.5 h-3.5" />
            Cuenta y privacidad
          </div>
          <h1 className="text-4xl lg:text-5xl text-white mb-4 leading-tight">Configuración</h1>
          <p className="text-lg text-white/60 max-w-lg">
            Administra tu cuenta, notificaciones y privacidad
          </p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 lg:px-12 -mt-8 pb-32 space-y-6">
        <ChangePasswordSection />
        <NotificationsSection />
        <PrivacySection />
        <DangerZoneSection />
      </div>
    </div>
  );
}
