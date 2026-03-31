'use client';

import { useState } from 'react';
import { Check, Loader2, PlayCircle, Shield } from 'lucide-react';

interface PrivacyAcceptanceScreenProps {
  error: string | null;
  saving: boolean;
  onAccept: () => void;
}

export function PrivacyAcceptanceScreen({ error, saving, onAccept }: PrivacyAcceptanceScreenProps) {
  const [dataConsent, setDataConsent] = useState(false);
  const [deletionConsent, setDeletionConsent] = useState(false);
  const canProceed = dataConsent && deletionConsent && !saving;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
      <div className="max-w-lg rounded-2xl border-2 border-stone-200 bg-white p-8 shadow-sm">
        <Shield className="mx-auto h-12 w-12 text-sky-600" />
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
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <span>El formulario tiene 13 pasos con contenido educativo</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <span>Podés pausar y retomar cuando quieras</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
              <span>Tus datos se guardan automáticamente</span>
            </li>
          </ul>
        </div>

        <div className="mt-6 space-y-3 text-xs text-stone-600">
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dataConsent}
              onChange={e => setDataConsent(e.target.checked)}
              className="mt-0.5 accent-sky-600"
              aria-label="Consentimiento de almacenamiento de datos"
            />
            <span>
              Acepto que mis datos de salud sean almacenados de forma segura y compartidos únicamente con mi equipo médico.
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={deletionConsent}
              onChange={e => setDeletionConsent(e.target.checked)}
              className="mt-0.5 accent-sky-600"
              aria-label="Comprensión del derecho a eliminación"
            />
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
          disabled={!canProceed}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PlayCircle className="h-4 w-4" />
          )}
          Comenzar anamnesis
        </button>

        {!canProceed && !saving && (
          <p className="mt-2 text-center text-[10px] text-stone-400">
            Marcá ambas casillas para continuar
          </p>
        )}

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
