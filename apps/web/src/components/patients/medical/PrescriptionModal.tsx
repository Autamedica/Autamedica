'use client'

import { useEffect, useState } from 'react'
import { X, Pill, Calendar, User, Clock, AlertCircle, ExternalLink } from 'lucide-react'
import { logger } from '@autamedica/shared'
import { fetchApi } from '@/lib/api-client'

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

interface DispensationOrderData {
  id: string
  status: string
  pharmacy_name: string | null
  dispense_window_start: string | null
  dispense_window_end: string | null
  updated_at: string
}

interface DispensationEventData {
  id: string
  dispense_status: string | null
  dispensed_medication: string | null
  dispensed_formulation: string | null
  dispensed_quantity: number | null
  substitution_type: string | null
  pharmacy_notes: string | null
  dispensed_at: string | null
}

interface PatientDispensationResponse {
  prescription_status: string
  dispensation: DispensationOrderData | null
  events: DispensationEventData[]
}

const DISPENSATION_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente de asignación',
  assigned: 'Asignada a farmacia',
  under_review: 'En revisión farmacéutica',
  clarification_requested: 'Farmacia pidió aclaración',
  clarification_provided: 'Aclaración enviada',
  approved_for_dispensation: 'Lista para dispensar',
  dispensed: 'Dispensada',
  partially_dispensed: 'Dispensación parcial',
  blocked: 'Bloqueada',
  cancelled: 'Cancelada',
  expired: 'Vencida',
}

const DISPENSATION_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  assigned: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  clarification_requested: 'bg-orange-100 text-orange-700',
  clarification_provided: 'bg-cyan-100 text-cyan-700',
  approved_for_dispensation: 'bg-emerald-100 text-emerald-700',
  dispensed: 'bg-emerald-100 text-emerald-700',
  partially_dispensed: 'bg-sky-100 text-sky-700',
  blocked: 'bg-red-100 text-red-700',
  cancelled: 'bg-stone-200 text-stone-600',
  expired: 'bg-stone-200 text-stone-600',
}

function getVerifyUrl(cuir?: string | null): string | null {
  if (!cuir) return null
  return `/verify/${encodeURIComponent(cuir)}`
}

function getDownloadablePdfUrl(
  signedPdfUrl?: string | null,
  verifyUrl?: string | null,
): string | null {
  if (!signedPdfUrl) return null
  if (verifyUrl && signedPdfUrl === verifyUrl) return null
  if (signedPdfUrl.includes('/verify/')) return null
  return signedPdfUrl
}

function formatShortDate(value?: string | null): string | null {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

export function PrescriptionModal({ prescription, onClose }: PrescriptionModalProps) {
  const [dispensationData, setDispensationData] = useState<PatientDispensationResponse | null>(null)
  const [dispensationLoading, setDispensationLoading] = useState(true)
  const [dispensationError, setDispensationError] = useState<string | null>(null)
  const meds: Medication[] = prescription.medications ?? [{
    name: prescription.medication,
    dosage: prescription.dosage,
    frequency: prescription.frequency,
    duration: prescription.duration,
    instructions: prescription.instructions,
  }]
  const doctorName = prescription.doctorName ?? 'Profesional tratante'
  const hasDigitalArtifact = Boolean(prescription.hasDigitalArtifact)
  const verifyUrl = getVerifyUrl(prescription.cuir)
  const downloadablePdfUrl = getDownloadablePdfUrl(prescription.signedPdfUrl, verifyUrl)
  const artifactMessage = prescription.artifactWarning
    ?? (
      prescription.requiresStrictValidation
        ? 'Esta medicacion requiere validacion reforzada y todavia no vemos un soporte electronico verificable desde esta pantalla.'
        : 'Este registro no incluye todavia un PDF firmado ni un codigo verificable para presentacion en farmacia.'
    )

  useEffect(() => {
    const controller = new AbortController()
    let cancelled = false

    const loadDispensation = async () => {
      setDispensationLoading(true)
      setDispensationError(null)

      try {
        const data = await fetchApi<PatientDispensationResponse>(
          `/api/patients/prescriptions/${prescription.id}/dispensation`,
          { signal: controller.signal },
        )

        if (!cancelled) {
          setDispensationData(data)
        }
      } catch (error) {
        if (controller.signal.aborted || cancelled) return
        logger.error('[PrescriptionModal] Failed to load dispensation status', error)
        setDispensationError('No pudimos cargar el seguimiento de farmacia.')
      } finally {
        if (!cancelled) {
          setDispensationLoading(false)
        }
      }
    }

    void loadDispensation()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [prescription.id])

  const dispensation = dispensationData?.dispensation ?? null
  const latestEvents = dispensationData?.events?.slice(0, 3) ?? []
  const dispensationStatusLabel = dispensation
    ? DISPENSATION_STATUS_LABEL[dispensation.status] ?? dispensation.status
    : null
  const dispensationStatusStyle = dispensation
    ? DISPENSATION_STATUS_STYLE[dispensation.status] ?? 'bg-slate-100 text-slate-700'
    : 'bg-slate-100 text-slate-700'
  const windowStart = formatShortDate(dispensation?.dispense_window_start)
  const windowEnd = formatShortDate(dispensation?.dispense_window_end)

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

        <div className="border-t border-slate-100 pt-5 mb-6">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Seguimiento en farmacia
          </h3>

          <div className="rounded-xl border border-slate-100 bg-white p-4">
            {dispensationLoading ? (
              <p className="text-sm text-slate-500">
                Cargando estado de dispensación...
              </p>
            ) : dispensationError ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {dispensationError}
              </div>
            ) : !dispensation ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-900">
                  Todavía no hay una dispensación activa para esta receta.
                </p>
                <p className="text-sm text-slate-500">
                  Cuando la receta entre al circuito de farmacia, vas a ver acá la farmacia asignada, el estado actual y los movimientos recientes.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${dispensationStatusStyle}`}>
                    {dispensationStatusLabel}
                  </span>
                  {dispensation.pharmacy_name && (
                    <span className="text-sm font-medium text-slate-700">
                      {dispensation.pharmacy_name}
                    </span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Ventana de retiro
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {windowStart && windowEnd
                        ? `${windowStart} al ${windowEnd}`
                        : windowEnd
                          ? `Hasta ${windowEnd}`
                          : 'A confirmar por farmacia'}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Última actualización
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-800">
                      {formatShortDate(dispensation.updated_at) ?? 'Sin movimientos recientes'}
                    </p>
                  </div>
                </div>

                {latestEvents.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      Movimientos recientes
                    </p>
                    {latestEvents.map((event) => (
                      <div key={event.id} className="rounded-xl border border-slate-100 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">
                            {DISPENSATION_STATUS_LABEL[event.dispense_status ?? ''] ?? 'Movimiento registrado'}
                          </p>
                          <span className="text-xs text-slate-400">
                            {formatShortDate(event.dispensed_at) ?? 'Fecha pendiente'}
                          </span>
                        </div>
                        {(event.dispensed_medication || event.dispensed_quantity) && (
                          <p className="mt-1 text-sm text-slate-600">
                            {event.dispensed_medication ?? 'Medicamento registrado'}
                            {event.dispensed_quantity ? ` · ${event.dispensed_quantity} unidad${event.dispensed_quantity === 1 ? '' : 'es'}` : ''}
                          </p>
                        )}
                        {event.pharmacy_notes && (
                          <p className="mt-1 text-xs text-slate-500">
                            Nota de farmacia: {event.pharmacy_notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
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

                {hasDigitalArtifact && verifyUrl && (
                  <a
                    href={verifyUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir verificador / QR
                  </a>
                )}

                {downloadablePdfUrl && (
                  <a
                    href={downloadablePdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 flex w-full justify-center items-center gap-2 rounded-xl border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-sky-700 hover:bg-sky-50 shadow-sm"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir receta en PDF
                  </a>
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
