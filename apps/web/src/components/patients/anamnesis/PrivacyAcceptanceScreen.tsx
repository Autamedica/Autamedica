'use client';

import { Check, Loader2, PlayCircle, Shield } from 'lucide-react';

interface PrivacyAcceptanceScreenProps {
  error: string | null;
  saving: boolean;
  onAccept: () => void;
}

export function PrivacyAcceptanceScreen({ error, saving, onAccept }: PrivacyAcceptanceScreenProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
      <div className="max-w-lg rounded-2xl border-2 border-stone-200 bg-white p-8 shadow-sm">
        <Shield className="mx-auto h-12 w-12 text-emerald-700" />
        <h1 className="mt-4 text-center text-xl font-bold text-stone-900">
          Tu historia clínica digital
        </h1>
        <p className="mt-3 text-center text-sm text-stone-600">
          Vamos a hacerte algunas preguntas sobre tu salud. Esta información es confidencial y solo será compartida con tu equipo médico.
        </p>

        <div className="mt-6 space-y-3 rounded-xl bg-stone-50 p-4">
          <h2 className="text-sm font-semibold text-stone-800">Antes de comenzar:</h2>
          <ul className="space-y-2 text-sm text-stone-600">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>El formulario tiene 13 pasos con contenido educativo</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>Puedes pausar y retomar cuando quieras</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>Cada 4 pasos habrá una pausa para descansar</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <span>Tus datos se guardan automáticamente</span>
            </li>
          </ul>
        </div>

        <div className="mt-6 space-y-3 text-xs text-stone-500">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked disabled className="mt-0.5 accent-emerald-600" />
            <span>
              Acepto que mis datos de salud sean almacenados de forma segura y compartidos únicamente con mi equipo médico.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" checked disabled className="mt-0.5 accent-emerald-600" />
            <span>
              Comprendo que puedo solicitar la eliminación de mis datos en cualquier momento.
            </span>
          </label>
        </div>

        {error && (
          <p className="mt-4 text-center text-xs text-red-600">{error}</p>
        )}

        <button
          onClick={onAccept}
          disabled={saving}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          Comenzar anamnesis
        </button>

        <a
          href="/patients/dashboard"
          className="mt-3 block text-center text-xs text-stone-500 transition-colors hover:text-stone-600"
        >
          Completar más tarde
        </a>
      </div>
    </div>
  );
}
