'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Check, CheckCircle2, CircleAlert, Loader2, Mic } from 'lucide-react';
import type { GuidanceQuestion } from '@/lib/patients/services/anamnesis-guidance.service';

/** Seconds before showing "skip" option on the loading spinner */
const SLOW_THRESHOLD_S = 40;

interface AnalysisResultOverlayProps {
  analysisResult: { coverage: string[]; gaps: string[]; questions: GuidanceQuestion[] } | null;
  onContinue: () => void;
  isFinal?: boolean;
  preferVoice?: boolean;
}

export function AnalysisResultOverlay({
  analysisResult,
  onContinue,
  isFinal,
  preferVoice = false,
}: AnalysisResultOverlayProps) {
  const [showSkip, setShowSkip] = useState(false);
  const coverageCount = analysisResult?.coverage.length ?? 0;
  const gapCount = analysisResult?.gaps.length ?? 0;
  const questionCount = analysisResult?.questions.length ?? 0;
  const hasFollowUp = questionCount > 0;

  useEffect(() => {
    if (analysisResult) return;
    const timer = setTimeout(() => setShowSkip(true), SLOW_THRESHOLD_S * 1000);
    return () => clearTimeout(timer);
  }, [analysisResult]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-sky-50 to-white">
      <div className="mx-auto w-full max-w-5xl px-4 sm:px-6">
        {!analysisResult ? (
          <div className="rounded-[28px] border border-sky-100 bg-white/95 px-6 py-8 text-center shadow-[0_24px_80px_-32px_rgba(14,116,144,0.28)] backdrop-blur">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sky-100">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Resumen clínico</p>
              <h2 className="mt-2 text-xl font-bold text-stone-900">Analizando tu carga</h2>
              <p className="mt-2 text-sm text-stone-500">
                Estamos detectando lo ya registrado y los puntos que conviene cerrar ahora.
              </p>
            </div>
            <div className="mt-5 flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full bg-sky-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>

            {showSkip && (
              <div className="space-y-2 pt-4">
                <p className="text-xs text-stone-400">Está tardando más de lo esperado</p>
                <button
                  onClick={onContinue}
                  className="text-sm text-stone-500 underline transition-colors hover:text-stone-700"
                >
                  Continuar sin análisis
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="mx-auto max-w-4xl rounded-[28px] border border-stone-200/80 bg-white/95 p-5 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.18)] backdrop-blur sm:p-7">
            <div className="space-y-5 text-left">
              <div className="border-b border-stone-100 pb-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Resumen rápido</p>
                  <h2 className="mt-2 text-2xl font-bold text-stone-900">
                    {isFinal ? 'Revisión final lista' : 'Carga guardada'}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {hasFollowUp
                      ? `${questionCount} pregunta${questionCount === 1 ? '' : 's'} breve${questionCount === 1 ? '' : 's'} para cerrar este bloque.`
                      : 'No quedan preguntas pendientes en esta etapa.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-4">
                  {coverageCount > 0 && (
                    <section className="rounded-3xl border border-stone-200 bg-white p-5">
                      <div className="flex items-center gap-2 text-stone-900">
                        <CheckCircle2 className="h-4 w-4 text-sky-600" />
                        <h3 className="text-sm font-semibold">Información registrada</h3>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {analysisResult.coverage.map((area) => (
                          <div
                            key={area}
                            className="flex items-start gap-3 rounded-2xl border border-stone-100 bg-stone-50/60 px-3 py-3"
                          >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              <Check className="h-3 w-3" />
                            </span>
                            <span className="text-sm font-medium text-stone-700">{area}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {gapCount > 0 && (
                    <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5">
                      <div className="flex items-center gap-2 text-amber-900">
                        <CircleAlert className="h-4 w-4" />
                        <h3 className="text-sm font-semibold">Puntos por cerrar</h3>
                      </div>
                      <div className="mt-4 space-y-2.5">
                        {analysisResult.gaps.map((gap) => (
                          <div
                            key={gap}
                            className="flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-white/80 px-3 py-3"
                          >
                            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                            <span className="text-sm text-amber-950">{gap}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {coverageCount === 0 && gapCount === 0 && (
                    <div className="rounded-3xl border border-stone-200 bg-white p-5 text-center">
                      <p className="text-sm text-stone-600">Tus respuestas quedaron registradas correctamente.</p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <section className="rounded-3xl border border-stone-200 bg-white p-5">
                    <div className="flex items-center gap-2 text-stone-900">
                      <Mic className="h-4 w-4 text-sky-600" />
                      <h3 className="text-sm font-semibold">Próximo paso</h3>
                    </div>
                    <p className="mt-3 text-lg font-semibold text-stone-900">
                      {hasFollowUp ? 'Seguir con voz' : 'Continuar'}
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      {hasFollowUp
                        ? `${questionCount} pregunta${questionCount === 1 ? '' : 's'} corta${questionCount === 1 ? '' : 's'} sobre lo pendiente.`
                        : 'Podés seguir al siguiente paso.'}
                    </p>
                    {hasFollowUp && (
                      <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700">
                        <Mic className="h-3.5 w-3.5" />
                        Menos de 1 minuto
                      </div>
                    )}
                  </section>
                </div>
              </div>

              <div className="flex flex-col gap-3 border-t border-stone-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-stone-500">
                  {hasFollowUp ? 'Podés completar esto ahora mismo.' : 'Todo listo para seguir.'}
                </p>
                <button
                  onClick={onContinue}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 sm:w-auto sm:min-w-[220px]"
                >
                  {hasFollowUp
                    ? preferVoice
                      ? 'Continuar con voz'
                      : 'Completar datos'
                    : 'Continuar'}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
