'use client'

import { useState, useCallback } from 'react'
import { MessageCircleQuestion, ArrowRight, Loader2, Sparkles } from 'lucide-react'
import type { ExtractionGuidance, GuidanceQuestion } from '@/lib/patients/services/anamnesis-guidance.service'

interface ClarificationStepProps {
  guidance: ExtractionGuidance
  isPartial: boolean
  onSubmit: (answers: { question: string; answer: string }[]) => void
  onSkip: () => void
  isSubmitting?: boolean
}

export function ClarificationStep({
  guidance,
  isPartial,
  onSubmit,
  onSkip,
  isSubmitting,
}: ClarificationStepProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})

  const handleChange = useCallback((questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }, [])

  const handleSubmit = useCallback(() => {
    const filled = guidance.questions
      .filter(q => answers[q.id]?.trim())
      .map(q => ({ question: q.text, answer: answers[q.id].trim() }))

    onSubmit(filled)
  }, [guidance.questions, answers, onSubmit])

  const hasAnyAnswer = Object.values(answers).some(v => v.trim())

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-sky-50">
          <Sparkles className="h-7 w-7 text-sky-700" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {isPartial
            ? 'Precisamos algunos datos'
            : 'Revisión final de tu historia clínica'}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {isPartial
            ? 'Nuestro análisis identificó información que conviene ampliar para que tu médico cuente con el panorama completo.'
            : 'Antes de finalizar, confirmá estos datos para asegurar la calidad de tu historia clínica.'}
        </p>
      </div>

      {/* Coverage summary */}
      {guidance.coverageSummary && (
        <div className="mb-6 rounded-xl border border-sky-100 bg-sky-50/50 px-4 py-3 text-sm text-sky-800">
          {guidance.coverageSummary}
        </div>
      )}

      {/* Questions */}
      <div className="space-y-6">
        {guidance.questions.map((question: GuidanceQuestion) => (
          <div
            key={question.id}
            className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm"
          >
            <div className="mb-1 flex items-start gap-2">
              <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
              <div>
                <p className="text-sm font-medium text-gray-900">{question.text}</p>
                <p className="mt-1 text-xs text-gray-400">{question.rationale}</p>
              </div>
            </div>

            <textarea
              value={answers[question.id] ?? ''}
              onChange={e => handleChange(question.id, e.target.value)}
              placeholder="Tu respuesta..."
              rows={2}
              className="mt-3 w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-sky-300 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-300"
            />
          </div>
        ))}
      </div>

      {/* Alerts */}
      {guidance.alerts.length > 0 && (
        <div className="mt-6 space-y-2">
          {guidance.alerts.map((alert, i) => (
            <p key={i} className="text-xs text-amber-700">{alert}</p>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={onSkip}
          disabled={isSubmitting}
          className="text-sm text-gray-400 transition-colors hover:text-gray-600"
        >
          {isPartial ? 'Omitir y continuar' : 'Enviar sin responder'}
        </button>

        <button
          onClick={handleSubmit}
          disabled={isSubmitting || !hasAnyAnswer}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Continuar
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  )
}
