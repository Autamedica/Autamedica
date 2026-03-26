'use client'

import { useState } from 'react'
import { X, Star, Send } from 'lucide-react'
import { useModalAccessibility } from '@/hooks/patients/useModalAccessibility'
import type { AppointmentWithDoctor } from '@/lib/patients/types/appointment'

interface ReviewModalProps {
  isOpen: boolean
  onClose: () => void
  appointment: AppointmentWithDoctor
  onSubmit: (data: {
    appointment_id: string
    overall_rating: number
    punctuality_rating?: number
    communication_rating?: number
    professionalism_rating?: number
    clinical_quality_rating?: number
    comment?: string
    is_anonymous?: boolean
  }) => Promise<boolean>
  submitting: boolean
  error: string | null
}

interface RatingCategory {
  key: string
  label: string
  required: boolean
}

const CATEGORIES: RatingCategory[] = [
  { key: 'overall_rating', label: 'Experiencia general', required: true },
  { key: 'punctuality_rating', label: 'Puntualidad', required: false },
  { key: 'communication_rating', label: 'Comunicacion', required: false },
  { key: 'professionalism_rating', label: 'Profesionalismo', required: false },
  { key: 'clinical_quality_rating', label: 'Calidad clinica', required: false },
]

function StarSelector({
  value,
  onChange,
  label,
  required,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  required: boolean
}) {
  const [hover, setHover] = useState(0)

  return (
    <div className="flex items-center justify-between py-2" role="group" aria-label={label}>
      <span className="text-sm text-stone-700">
        {label}
        {required && <span className="text-red-600 ml-1" aria-hidden="true">*</span>}
      </span>
      <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            className="p-0.5 transition-transform hover:scale-110"
            aria-label={`${star} estrella${star > 1 ? 's' : ''}`}
          >
            <Star
              className={`h-6 w-6 transition-colors ${
                star <= (hover || value)
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-none text-stone-500'
              }`}
            />
          </button>
        ))}
      </div>
    </div>
  )
}

export function ReviewModal({
  isOpen,
  onClose,
  appointment,
  onSubmit,
  submitting,
  error,
}: ReviewModalProps) {
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const { modalRef } = useModalAccessibility({ isOpen, onClose })

  const doctorName = appointment.doctor
    ? `${appointment.doctor.first_name ?? ''} ${appointment.doctor.last_name ?? ''}`.trim() || 'el medico'
    : 'el medico'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ratings.overall_rating) return

    const success = await onSubmit({
      appointment_id: appointment.id,
      overall_rating: ratings.overall_rating,
      punctuality_rating: ratings.punctuality_rating,
      communication_rating: ratings.communication_rating,
      professionalism_rating: ratings.professionalism_rating,
      clinical_quality_rating: ratings.clinical_quality_rating,
      comment: comment.trim() || undefined,
      is_anonymous: isAnonymous,
    })

    if (success) {
      setSubmitted(true)
      setTimeout(() => {
        onClose()
        setSubmitted(false)
        setRatings({})
        setComment('')
        setIsAnonymous(false)
      }, 1500)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-modal-title"
        className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between p-6 border-b border-stone-200">
          <h2 id="review-modal-title" className="text-xl font-bold text-stone-900">
            Evaluar consulta
          </h2>
          <button
            onClick={onClose}
            aria-label="Cerrar modal"
            className="p-2 hover:bg-stone-100 rounded-lg transition-colors"
            disabled={submitting}
          >
            <X className="h-5 w-5 text-stone-600" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Star className="h-6 w-6 fill-green-600 text-green-700" />
            </div>
            <p className="text-lg font-medium text-stone-900">Evaluacion enviada</p>
            <p className="mt-1 text-sm text-stone-500">Gracias por tu feedback</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <p className="text-sm text-stone-600">
              Evalua tu consulta con {doctorName}
            </p>

            <div className="divide-y divide-stone-100">
              {CATEGORIES.map((cat) => (
                <StarSelector
                  key={cat.key}
                  value={ratings[cat.key] ?? 0}
                  onChange={(v) => setRatings((prev) => ({ ...prev, [cat.key]: v }))}
                  label={cat.label}
                  required={cat.required}
                />
              ))}
            </div>

            <div>
              <label htmlFor="review-comment" className="block text-sm font-medium text-stone-700 mb-1">
                Comentario (opcional)
              </label>
              <textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Comparte tu experiencia..."
                className="w-full px-4 py-2 border border-stone-300 rounded-lg focus:ring-2 focus:ring-stone-800 focus:border-transparent resize-none text-sm"
              />
              <p className="text-xs text-stone-500 text-right">{comment.length}/1000</p>
            </div>

            <label htmlFor="review-anonymous" className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
              <input
                id="review-anonymous"
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="rounded border-stone-300 text-stone-800 focus:ring-stone-800"
              />
              Enviar de forma anonima
            </label>

            {error && (
              <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 px-4 py-2 text-stone-700 bg-stone-100 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting || !ratings.overall_rating}
                className="flex-1 px-4 py-2 text-white bg-stone-800 rounded-lg hover:bg-stone-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" aria-hidden="true" />
                    Enviar evaluacion
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
