'use client';

import { useState, useEffect } from 'react';
import { ArrowRight, Check, Mic } from 'lucide-react';
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
  preferVoice: _preferVoice = false,
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
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white">
      <div className="w-full max-w-4xl px-6 py-8 md:py-12 overflow-y-auto max-h-screen">
        {!analysisResult ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-10 flex h-16 w-16 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-100 border-t-stone-900" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-400">Motor de Análisis</p>
            <h2 className="mt-6 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              Procesando perfil clínico
            </h2>
            <p className="mt-3 text-sm font-medium text-stone-500 max-w-xs mx-auto leading-relaxed">
              Estructurando respuestas para optimizar la revisión del profesional.
            </p>

            {showSkip && (
              <div className="mt-16 border-t border-stone-50 pt-8 w-full max-w-xs">
                <p className="text-[10px] font-bold uppercase tracking-widest text-stone-300">Análisis demorado</p>
                <button
                  onClick={onContinue}
                  className="mt-4 text-xs font-bold uppercase tracking-widest text-stone-900 underline underline-offset-8 transition-colors hover:text-stone-500"
                >
                  Omitir y continuar
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Senior */}
            <div className="mb-16">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-stone-400 mb-4">Estructura de Datos</p>
              <h2 className="text-4xl font-bold tracking-tight text-stone-900 md:text-5xl">
                {isFinal ? 'Revisión final' : 'Carga validada'}
              </h2>
              <p className="mt-4 text-base font-medium text-stone-500 max-w-xl leading-relaxed">
                {hasFollowUp
                  ? `Análisis completado. Detectamos ${questionCount} punto${questionCount === 1 ? '' : 's'} que requieren mayor profundidad médica.`
                  : 'Toda la información crítica ha sido procesada y validada con éxito.'}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-16">
                {coverageCount > 0 && (
                  <section>
                    <div className="mb-8 flex items-center gap-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Secciones Validadas</h3>
                      <div className="h-px flex-1 bg-stone-50" />
                    </div>
                    <div className="space-y-3">
                      {analysisResult.coverage.map((area) => (
                        <div
                          key={area}
                          className="flex items-center gap-4 rounded-xl border border-stone-100 bg-white p-4 transition-all hover:border-stone-200"
                        >
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-50 text-emerald-600">
                            <Check className="h-3.5 w-3.5" />
                          </div>
                          <span className="text-sm font-semibold text-stone-800 tracking-tight">{area}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {gapCount > 0 && (
                  <section>
                    <div className="mb-8 flex items-center gap-4">
                      <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600/60">Puntos por detallar</h3>
                      <div className="h-px flex-1 bg-amber-50/50" />
                    </div>
                    <div className="space-y-3">
                      {analysisResult.gaps.map((gap) => (
                        <div
                          key={gap}
                          className="group flex items-start gap-4 rounded-xl border border-stone-100 bg-white p-5 transition-all hover:border-amber-100"
                        >
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                          <span className="text-sm font-medium text-stone-700 leading-relaxed tracking-tight">{gap}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>

              <div className="lg:pl-8 lg:border-l lg:border-stone-50">
                <section className="sticky top-12">
                  <div className="mb-8 flex items-center gap-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Próxima Fase</h3>
                    <div className="h-px flex-1 bg-stone-50" />
                  </div>
                  <div className="rounded-2xl border border-stone-900 bg-stone-900 p-8 text-white shadow-2xl shadow-stone-200">
                    <div className="flex items-center gap-3 opacity-50">
                      <Mic className="h-4 w-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Protocolo Médico</span>
                    </div>
                    <p className="mt-6 text-2xl font-bold tracking-tight">
                      {hasFollowUp ? 'Seguir con voz' : 'Finalizar'}
                    </p>
                    <p className="mt-3 text-sm font-medium text-stone-400 leading-relaxed">
                      {hasFollowUp
                        ? `Resolveremos las ${questionCount} dudas detectadas mediante una interacción de voz asistida.`
                        : 'El proceso ha concluido. Puedes revisar el resumen antes de continuar.'}
                    </p>
                    
                    <button
                      onClick={onContinue}
                      className="mt-10 flex w-full items-center justify-between rounded-xl bg-white px-6 py-5 text-sm font-bold text-stone-900 transition-all hover:bg-stone-50 active:scale-[0.98]"
                    >
                      {hasFollowUp ? 'Comenzar ahora' : 'Continuar'}
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                  
                  {hasFollowUp && (
                    <div className="mt-8 flex items-center justify-center gap-3 px-2">
                      <div className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400">Estimado: ~45 segundos</span>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
