'use client';

import { useState, useEffect } from 'react';
import { Check, CheckCircle2, Loader2 } from 'lucide-react';
import type { GuidanceQuestion } from '@/lib/patients/services/anamnesis-guidance.service';

/** Seconds before showing "skip" option on the loading spinner */
const SLOW_THRESHOLD_S = 40;

interface AnalysisResultOverlayProps {
  analysisResult: { coverage: string[]; gaps: string[]; questions: GuidanceQuestion[] } | null;
  onContinue: () => void;
  isFinal?: boolean;
}

export function AnalysisResultOverlay({ analysisResult, onContinue, isFinal }: AnalysisResultOverlayProps) {
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    if (analysisResult) return;
    const timer = setTimeout(() => setShowSkip(true), SLOW_THRESHOLD_S * 1000);
    return () => clearTimeout(timer);
  }, [analysisResult]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-sky-50 to-white">
      <div className="mx-auto max-w-lg px-6 text-center">
        {!analysisResult ? (
          <div className="space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sky-100">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Analizando tu historia clínica</h2>
              <p className="mt-2 text-sm text-stone-500">
                Nuestro sistema de inteligencia artificial está revisando tus respuestas para identificar información relevante para tu médico.
              </p>
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-sky-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>

            {showSkip && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-stone-400">El análisis está tardando más de lo esperado</p>
                <button
                  onClick={onContinue}
                  className="text-sm text-stone-500 underline transition-colors hover:text-stone-700"
                >
                  Continuar sin el análisis
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6 text-left">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
                <CheckCircle2 className="h-8 w-8 text-sky-600" />
              </div>
              <h2 className="mt-3 text-xl font-bold text-stone-900">Análisis completado</h2>
              <p className="mt-1 text-sm text-stone-500">
                {isFinal ? 'Revisión final de tu historia clínica' : 'Progreso parcial registrado'}
              </p>
            </div>

            {analysisResult.coverage.length > 0 && (
              <div className="rounded-xl border border-sky-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-sky-700 mb-2">Información registrada</h3>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.coverage.map((area) => (
                    <span key={area} className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700">
                      <Check className="h-3 w-3" /> {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysisResult.gaps.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-700 mb-2">Información adicional necesaria</h3>
                <ul className="space-y-1">
                  {analysisResult.gaps.map((gap) => (
                    <li key={gap} className="text-sm text-amber-800 flex items-start gap-2">
                      <span className="text-amber-600 mt-0.5">●</span> {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysisResult.coverage.length === 0 && analysisResult.gaps.length === 0 && (
              <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
                <p className="text-sm text-stone-600">Tus respuestas fueron registradas correctamente.</p>
              </div>
            )}

            {analysisResult.questions.length > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <h3 className="text-sm font-semibold text-sky-700 mb-1">
                  {analysisResult.questions.length} pregunta{analysisResult.questions.length > 1 ? 's' : ''} adicional{analysisResult.questions.length > 1 ? 'es' : ''}
                </h3>
                <p className="text-xs text-sky-600">
                  Necesitamos precisar algunos datos para que tu médico cuente con un panorama completo.
                </p>
              </div>
            )}

            <button
              onClick={onContinue}
              className="w-full rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700"
            >
              {analysisResult.questions.length > 0
                ? 'Completar información →'
                : 'Continuar →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
