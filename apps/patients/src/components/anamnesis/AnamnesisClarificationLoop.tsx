'use client';

import type {
  AnamnesisClarificationTurn,
  AnamnesisExtractionRequest,
  AnamnesisExtractionResult,
} from '@/types/anamnesis-extraction';
import { logger } from '@autamedica/shared';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Send,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';

interface ExtractionResponsePayload {
  providerConfigured: boolean;
  providerName: string | null;
  modelName: string;
  promptVersion: string;
  request: AnamnesisExtractionRequest;
  result?: AnamnesisExtractionResult;
}

function priorityWeight(priority: 'critical' | 'high' | 'medium'): number {
  switch (priority) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    default:
      return 2;
  }
}

export function AnamnesisClarificationLoop(): ReactElement {
  const [turns, setTurns] = useState<AnamnesisClarificationTurn[]>([]);
  const [answerDraft, setAnswerDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<ExtractionResponsePayload | null>(null);

  const orderedQuestions = useMemo(() => {
    const questions = payload?.result?.nextQuestions ?? [];
    return [...questions].sort(
      (left, right) =>
        priorityWeight(left.priority) - priorityWeight(right.priority) ||
        left.question.localeCompare(right.question),
    );
  }, [payload?.result?.nextQuestions]);

  const currentQuestion = orderedQuestions[0] ?? null;
  const weakOrMissing = payload?.result?.argenteCoverage.weakOrMissing ?? [];
  const completedLoop = started && !loading && payload?.result != null && orderedQuestions.length === 0;

  async function runExtraction(nextTurns: AnamnesisClarificationTurn[]): Promise<void> {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/anamnesis/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clarificationTurns: nextTurns }),
      });

      const json = (await response.json().catch(() => ({}))) as {
        error?: string;
        data?: ExtractionResponsePayload;
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error || 'No fue posible ejecutar el bucle de aclaraciones');
      }

      setPayload(json.data);
      setTurns(nextTurns);
      setStarted(true);
    } catch (runError) {
      const message =
        runError instanceof Error ? runError.message : 'No fue posible ejecutar el bucle de aclaraciones';
      logger.error('[AnamnesisClarificationLoop] runExtraction failed', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStart(): Promise<void> {
    await runExtraction([]);
  }

  async function handleRefresh(): Promise<void> {
    await runExtraction(turns);
  }

  async function handleSubmitAnswer(): Promise<void> {
    if (!currentQuestion) {
      return;
    }

    const normalizedAnswer = answerDraft.trim();
    if (!normalizedAnswer) {
      setError('Debe responder la pregunta actual para continuar.');
      return;
    }

    const nextTurn: AnamnesisClarificationTurn = {
      ...currentQuestion,
      answer: normalizedAnswer,
      answeredAt: new Date().toISOString(),
    };

    setAnswerDraft('');
    await runExtraction([...turns, nextTurn]);
  }

  return (
    <section className="rounded-3xl border border-stone-200 bg-white/95 p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-stone-700">
            <Sparkles className="h-3.5 w-3.5" />
            Repregunta dirigida
          </div>
          <h2 className="text-xl font-semibold text-stone-900">
            Cierre semiológico asistido
          </h2>
          <p className="max-w-3xl text-sm leading-6 text-stone-600">
            Este bucle toma las <span className="font-semibold text-stone-900">nextQuestions</span> del
            extractor, le pregunta al paciente una por una y vuelve a correr la extracción hasta
            reducir las secciones débiles o faltantes.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleStart}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && !started ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {started ? 'Reiniciar análisis' : 'Iniciar repreguntas'}
          </button>
          {started && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Reextraer con historial
            </button>
          )}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-2xl border border-stone-200 bg-stone-50/70 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">
              Estado del cierre
            </h3>
            {completedLoop ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Sin preguntas pendientes
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                {started ? `${orderedQuestions.length} preguntas pendientes` : 'Aún no iniciado'}
              </span>
            )}
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <p className="text-sm font-medium text-stone-900">Secciones débiles o faltantes</p>
              {weakOrMissing.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {weakOrMissing.map((item) => (
                    <span
                      key={item}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-stone-700 ring-1 ring-stone-200"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-500">
                  {started
                    ? 'No quedan huecos clínicos marcados por el extractor.'
                    : 'Al iniciar, aquí aparecerán las áreas que requieren repregunta.'}
                </p>
              )}
            </div>

            <div>
              <p className="text-sm font-medium text-stone-900">Historial de aclaraciones</p>
              {turns.length > 0 ? (
                <div className="mt-3 space-y-3">
                  {turns.map((turn, index) => (
                    <div key={`${turn.answeredAt}-${index}`} className="space-y-2 rounded-2xl bg-white p-4 ring-1 ring-stone-200">
                      <div className="rounded-2xl bg-stone-100 px-4 py-3 text-sm text-stone-800">
                        <p className="font-medium text-stone-900">{turn.question}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.14em] text-stone-500">
                          {turn.priority} · {turn.targetSection} · {turn.questionType}
                        </p>
                      </div>
                      <div className="rounded-2xl bg-amber-50 px-4 py-3 text-sm text-stone-800 ring-1 ring-amber-200">
                        {turn.answer}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-stone-500">
                  Aún no hay respuestas inyectadas de vuelta al extractor.
                </p>
              )}
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-stone-200 bg-white p-5">
          <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-stone-500">
            Pregunta activa
          </h3>

          {!started ? (
            <p className="mt-4 text-sm leading-6 text-stone-500">
              Inicie el análisis para que el extractor proponga repreguntas priorizadas.
            </p>
          ) : loading ? (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-stone-50 px-4 py-4 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Ejecutando nueva extracción con las aclaraciones disponibles...
            </div>
          ) : completedLoop ? (
            <div className="mt-6 rounded-2xl bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-800 ring-1 ring-emerald-200">
              El extractor ya no devolvió <span className="font-semibold">nextQuestions</span>.
              A partir de esta corrida, el bucle quedó clínicamente cerrado para esta capa.
            </div>
          ) : currentQuestion ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl bg-stone-100 px-4 py-4 ring-1 ring-stone-200">
                <p className="text-sm font-semibold text-stone-900">{currentQuestion.question}</p>
                <p className="mt-2 text-xs uppercase tracking-[0.14em] text-stone-500">
                  {currentQuestion.priority} · {currentQuestion.targetSection} · {currentQuestion.questionType}
                </p>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  {currentQuestion.rationale}
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="anamnesis-clarification-answer" className="text-sm font-medium text-stone-900">
                  Respuesta del paciente
                </label>
                <textarea
                  id="anamnesis-clarification-answer"
                  value={answerDraft}
                  onChange={(event) => setAnswerDraft(event.target.value)}
                  rows={6}
                  placeholder="Escriba la respuesta en lenguaje natural. El extractor la volverá a integrar como evidencia adicional."
                  className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-stone-500 focus:ring-2 focus:ring-stone-200"
                />
              </div>

              <button
                type="button"
                onClick={handleSubmitAnswer}
                disabled={loading || answerDraft.trim().length === 0}
                className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                Guardar respuesta y reextraer
              </button>
            </div>
          ) : (
            <p className="mt-4 text-sm leading-6 text-stone-500">
              El extractor respondió sin pregunta activa, pero todavía no marcó el cierre como completo.
              Reejecute la extracción para confirmar el estado.
            </p>
          )}

          {error && (
            <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {error}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
