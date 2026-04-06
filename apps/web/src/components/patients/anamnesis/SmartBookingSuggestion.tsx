'use client'

import { useEffect } from 'react'
import { CalendarCheck, CheckCircle2, Clock, Loader2, MapPin, Stethoscope, AlertTriangle, X } from 'lucide-react'
import { useSmartBooking, type SlotSuggestion } from '@/hooks/patients/useSmartBooking'

interface SmartBookingSuggestionProps {
  anamnesisId?: string
  onClose: () => void
  onBooked: () => void
}

const URGENCY_STYLES: Record<string, { bg: string; text: string; border: string; icon: string }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'text-red-500' },
  high: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'text-amber-500' },
  medium: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200', icon: 'text-sky-500' },
}

function formatSlotDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

function formatSlotTime(isoStr: string): string {
  const date = new Date(isoStr)
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function SlotCard({
  suggestion,
  onBook,
  booking,
}: {
  suggestion: SlotSuggestion
  onBook: () => void
  booking: boolean
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-stone-900">{suggestion.doctorName}</p>
        <div className="flex items-center gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1">
            <CalendarCheck className="h-3.5 w-3.5" />
            {formatSlotDate(suggestion.date)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatSlotTime(suggestion.startTime)}
          </span>
        </div>
        {suggestion.location && (
          <p className="flex items-center gap-1 text-xs text-stone-400">
            <MapPin className="h-3 w-3" />
            {suggestion.location}
          </p>
        )}
      </div>
      <button
        onClick={onBook}
        disabled={booking}
        className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700 disabled:opacity-50"
      >
        {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Agendar'}
      </button>
    </div>
  )
}

export function SmartBookingSuggestion({
  anamnesisId,
  onClose,
  onBooked,
}: SmartBookingSuggestionProps) {
  const {
    loading,
    error,
    specialtyDisplay,
    urgency,
    urgencyLabel,
    suggestions,
    booking,
    bookedAppointment,
    fetchSuggestions,
    bookSuggestion,
  } = useSmartBooking()

  useEffect(() => {
    void fetchSuggestions(anamnesisId)
  }, [anamnesisId, fetchSuggestions])

  const urgencyStyle = URGENCY_STYLES[urgency ?? 'medium'] ?? URGENCY_STYLES.medium

  if (bookedAppointment) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-sky-50 to-white">
        <div className="mx-auto max-w-lg px-6 text-center space-y-6">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
            <CheckCircle2 className="h-10 w-10 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-900">Cita agendada</h2>
            <p className="mt-2 text-sm text-stone-500">
              Tu consulta fue reservada exitosamente. Recibirás un recordatorio antes de la cita.
            </p>
          </div>
          <button
            onClick={onBooked}
            className="w-full rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-700"
          >
            Continuar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-sky-50 to-white">
      <div className="mx-auto max-w-lg px-6">
        {loading ? (
          <div className="text-center space-y-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-sky-100">
              <Loader2 className="h-10 w-10 animate-spin text-sky-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-900">Buscando turnos disponibles</h2>
              <p className="mt-2 text-sm text-stone-500">
                Estamos analizando tus síntomas para recomendarte el especialista adecuado.
              </p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center space-y-4">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
              <AlertTriangle className="h-8 w-8 text-red-500" />
            </div>
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={onClose}
              className="text-sm text-stone-500 underline hover:text-stone-700"
            >
              Continuar sin agendar
            </button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-stone-900">Recomendación de turno</h2>
                <p className="mt-1 text-sm text-stone-500">
                  Basado en tus síntomas, te recomendamos:
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-white p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100">
                <Stethoscope className="h-5 w-5 text-sky-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-stone-900">
                  {specialtyDisplay}
                </p>
                <div className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${urgencyStyle.bg} ${urgencyStyle.text} ${urgencyStyle.border} border`}>
                  <AlertTriangle className={`h-3 w-3 ${urgencyStyle.icon}`} />
                  {urgencyLabel}
                </div>
              </div>
            </div>

            {suggestions.length > 0 ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-stone-700">
                  Próximos turnos disponibles
                </h3>
                {suggestions.map((s) => (
                  <SlotCard
                    key={`${s.doctorId}-${s.startTime}`}
                    suggestion={s}
                    onBook={() => void bookSuggestion(s.doctorId, s.startTime, s.durationMinutes)}
                    booking={booking}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
                <p className="text-sm text-stone-600">
                  No hay turnos disponibles en los próximos días para esta especialidad.
                </p>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full rounded-xl border border-stone-200 px-6 py-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
            >
              Agendar más tarde
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
