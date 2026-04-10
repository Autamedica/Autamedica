'use client'

import { X, Pill, Calendar, User, Clock, AlertCircle, ExternalLink } from 'lucide-react'

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
  doctorName: string | null
  date: string
  cuir?: string | null
  vendorName?: string | null
  vendorId?: string | null
  signedPdfUrl?: string | null
  hasDigitalArtifact?: boolean
  artifactWarning?: string | null
  requiresStrictValidation?: boolean
  source?: 'legacy' | 'prescriptions_core'
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
  const doctorName = prescription.doctorName ?? 'Profesional tratante'
  const hasDigitalArtifact = Boolean(prescription.hasDigitalArtifact)
  const artifactMessage = prescription.artifactWarning
    ?? (
      prescription.requiresStrictValidation
        ? 'Esta medicacion requiere validacion reforzada y todavia no vemos un soporte electronico verificable desde esta pantalla.'
        : 'Este registro no incluye todavia un PDF firmado ni un codigo verificable para presentacion en farmacia.'
    )

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
            {doctorName}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            {new Intl.DateTimeFormat('es-AR', {
              day: 'numeric', month: 'short', year: 'numeric',
            }).format(new Date(prescription.date))}
          </span>
        </div>

        {/* ── ALTA PRIORIDAD: Información Clínica ── */}
        <div className="space-y-4 mb-6">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-600">
            Medicación Activa
          </h3>
          {meds.map((med, i) => (
            <div
              key={i}
              className="rounded-2xl p-5 border shadow-sm"
              style={{ background: 'var(--au-surface)', borderColor: 'var(--au-border)' }}
            >
              <div className="mb-3 flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <Pill className="h-5 w-5" />
                </div>
                <div>
                  <span className="block text-lg font-bold" style={{ color: 'var(--au-text-primary)' }}>
                    {med.name}
                  </span>
                  <span className="block text-sm font-medium mt-0.5" style={{ color: 'var(--au-text-secondary)' }}>
                    {med.dosage}
                  </span>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3 p-3 rounded-xl bg-slate-50">
                {med.frequency && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">{med.frequency}</span>
                  </div>
                )}
                {med.duration && (
                  <div className="flex items-center gap-2 text-sm text-slate-700">
                    <span className="text-slate-400 font-medium">Por:</span>
                    <span className="font-semibold">{med.duration}</span>
                  </div>
                )}
              </div>

              {med.instructions && (
                <div className="rounded-xl bg-sky-50 px-4 py-3 border border-sky-100">
                  <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 mb-1">Indicación médica</p>
                  <p className="text-sm text-sky-900 leading-relaxed font-medium">
                    {med.instructions}
                  </p>
                </div>
              )}
            </div>
          ))}

          {prescription.notes && (
            <div className="rounded-xl p-4 border border-slate-100 bg-white">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Indicaciones generales
              </p>
              <p className="text-sm leading-relaxed text-slate-800 font-medium">
                {prescription.notes}
              </p>
            </div>
          )}
        </div>

        {/* ── BAJA PRIORIDAD: Soporte para mostrador / QR / PDF ── */}
        <div className="border-t border-slate-100 pt-5">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Presentación en mostrador
          </h3>
          
          <div
            className="rounded-xl p-4 transition-all hover:bg-slate-50 border border-slate-100"
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className="mt-0.5 h-5 w-5 flex-shrink-0"
                style={{ color: hasDigitalArtifact ? '#34d399' : '#f59e0b' }}
              />
              <div className="min-w-0 w-full">
                <p className="mb-1 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--au-text-secondary)' }}>
                  {hasDigitalArtifact ? 'Código Verificador (QR)' : 'Disponibilidad'}
                </p>
                <p className="text-sm leading-relaxed text-slate-600 mb-2">
                  {hasDigitalArtifact
                    ? 'Mostrá el soporte electrónico en la farmacia para retirar la medicación.'
                    : artifactMessage}
                </p>

                {hasDigitalArtifact ? (
                  <button className="w-full mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 flex justify-center items-center gap-2">
                    Mostrar validador / QR
                  </button>
                ) : (
                  prescription.signedPdfUrl && (
                    <a
                      href={prescription.signedPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 flex w-full justify-center items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-50 shadow-sm"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir receta en PDF
                    </a>
                  )
                )}

                {prescription.cuir && (
                  <p className="mt-3 text-xs font-medium text-slate-400 text-center">
                    CUIR: {prescription.cuir}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
