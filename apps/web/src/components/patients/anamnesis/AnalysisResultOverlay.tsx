'use client';

import { Check, CheckCircle2, Loader2 } from 'lucide-react';
import type { GuidanceQuestion } from '@/lib/patients/services/anamnesis-guidance.service';

interface AnalysisResultOverlayProps {
  analysisResult: { coverage: string[]; gaps: string[]; questions: GuidanceQuestion[] } | null;
  onContinue: () => void;
  isFinal?: boolean;
}

export function AnalysisResultOverlay({ analysisResult, onContinue, isFinal }: AnalysisResultOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-emerald-50 to-sky-50">
      <div className="mx-auto max-w-lg px-6 text-center">
        {!analysisResult ? (
          // Loading state
          <div className="space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">AutaMedica está analizando tus respuestas</h2>
              <p className="mt-2 text-sm text-stone-600">
                Estamos revisando tu historia clínica para asegurarnos de que no falte información importante para tu médico.
              </p>
            </div>
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-emerald-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : (
          // Results state
          <div className="space-y-6 text-left">
            <div className="text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle2 className="h-8 w-8 text-emerald-700" />
              </div>
              <h2 className="mt-3 text-xl font-bold text-stone-900">Análisis completado</h2>
              <p className="mt-1 text-sm text-stone-600">
                {isFinal ? 'Revisión final de tu historia clínica' : 'Llevás la mitad de tu historia clínica'}
              </p>
            </div>

            {analysisResult.coverage.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-white p-4">
                <h3 className="text-sm font-semibold text-emerald-700 mb-2">Áreas cubiertas</h3>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.coverage.map((area) => (
                    <span key={area} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      <Check className="h-3 w-3" /> {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {analysisResult.gaps.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-700 mb-2">Tu médico necesitará más detalle en</h3>
                <ul className="space-y-1">
                  {analysisResult.gaps.map((gap) => (
                    <li key={gap} className="text-sm text-amber-800 flex items-start gap-2">
                      <span className="text-amber-700 mt-0.5">●</span> {gap}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {analysisResult.coverage.length === 0 && analysisResult.gaps.length === 0 && (
              <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
                <p className="text-sm text-stone-600">Tus respuestas se registraron correctamente. Continuá con los pasos restantes.</p>
              </div>
            )}

            {analysisResult.questions.length > 0 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                <h3 className="text-sm font-semibold text-sky-700 mb-1">
                  Tenemos {analysisResult.questions.length} pregunta{analysisResult.questions.length > 1 ? 's' : ''} para vos
                </h3>
                <p className="text-xs text-sky-600">
                  En el siguiente paso te vamos a pedir que aclares algunos datos para que tu médico tenga la información más completa.
                </p>
              </div>
            )}

            <button
              onClick={onContinue}
              className="w-full rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              {analysisResult.questions.length > 0
                ? 'Responder preguntas →'
                : 'Continuar con mi historia clínica →'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
