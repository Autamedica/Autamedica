'use client'

import { X, Pill, Calendar, User, Clock } from 'lucide-react'

interface Medication {
  name: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
}

interface PrescriptionData {
  id: string
  medication: string
  dosage: string
  frequency: string
  duration: string
  instructions: string
  diagnosis: string | null
  notes: string | null
  doctorName: string
  date: string
  medications?: Medication[]
}

interface PrescriptionModalProps {
  prescription: PrescriptionData
  onClose: () => void
}

export function PrescriptionModal({ prescription, onClose }: PrescriptionModalProps) {
  const meds: Medication[] = prescription.medications ?? [{
    name: prescription.medication,
    dosage: prescription.dosage,
    frequency: prescription.frequency,
    duration: prescription.duration,
    instructions: prescription.instructions,
  }]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="fixed inset-0 bg-black/60" onClick={onClose} />
      <div
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl p-6 sm:rounded-3xl"
        style={{
          background: 'var(--au-surface)',
          border: '1px solid var(--au-border)',
        }}
      >
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'rgba(249, 115, 22, 0.15)' }}
            >
              <Pill className="h-5 w-5" style={{ color: 'var(--au-text-primary)' }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--au-text-primary)' }}>
                Receta médica
              </h2>
              <p className="text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
                Prescripción #{prescription.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{ color: 'var(--au-text-tertiary)' }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-5 flex flex-wrap gap-4 text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {prescription.doctorName}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {new Intl.DateTimeFormat('es-AR', {
              day: 'numeric', month: 'short', year: 'numeric',
            }).format(new Date(prescription.date))}
          </span>
        </div>

        {prescription.diagnosis && (
          <div
            className="mb-4 rounded-xl p-3"
            style={{ background: 'var(--au-hover)', border: '1px solid var(--au-border)' }}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--au-text-tertiary)' }}>
              Diagnóstico
            </p>
            <p className="text-sm" style={{ color: 'var(--au-text-primary)' }}>
              {prescription.diagnosis}
            </p>
          </div>
        )}

        <div className="space-y-3">
          {meds.map((med, i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{ background: 'var(--au-hover)', border: '1px solid var(--au-border)' }}
            >
              <div className="mb-2 flex items-center gap-2">
                <Pill className="h-4 w-4" style={{ color: 'var(--au-accent)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--au-text-primary)' }}>
                  {med.name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--au-text-secondary)' }}>
                {med.dosage && (
                  <div>
                    <span style={{ color: 'var(--au-text-tertiary)' }}>Dosis:</span> {med.dosage}
                  </div>
                )}
                {med.frequency && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" style={{ color: 'var(--au-text-tertiary)' }} />
                    {med.frequency}
                  </div>
                )}
                {med.duration && (
                  <div>
                    <span style={{ color: 'var(--au-text-tertiary)' }}>Duración:</span> {med.duration}
                  </div>
                )}
              </div>
              {med.instructions && (
                <p className="mt-2 text-xs italic" style={{ color: 'var(--au-text-tertiary)' }}>
                  {med.instructions}
                </p>
              )}
            </div>
          ))}
        </div>

        {prescription.notes && (
          <div className="mt-4 rounded-xl p-3" style={{ background: 'var(--au-hover)' }}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--au-text-tertiary)' }}>
              Indicaciones generales
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--au-text-secondary)' }}>
              {prescription.notes}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
