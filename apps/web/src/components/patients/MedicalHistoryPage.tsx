'use client'

import { useState } from 'react'
import { Pill, Stethoscope, AlertCircle, CalendarPlus, FileText, ExternalLink } from 'lucide-react'
import { useMedicalHistory } from '@/hooks/patients/useMedicalHistory'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { PrescriptionModal } from '@/components/patients/medical/PrescriptionModal'
import type { PatientPrescription } from '@/lib/patients/types/medical-history'

const STATUS_LABEL: Record<string, string> = {
  activa: 'Activa',
  active: 'Activa',
  completada: 'Completada',
  completed: 'Completada',
  cancelada: 'Cancelada',
  cancelled: 'Cancelada',
  pausada: 'Pausada',
  draft: 'Borrador',
  signed: 'Firmada',
  sent: 'Emitida',
  dispensed_partial: 'Dispensacion parcial',
  dispensed_total: 'Dispensada',
  expired: 'Vencida',
}

const STATUS_COLOR: Record<string, string> = {
  activa: 'bg-emerald-500/15 text-emerald-400',
  active: 'bg-emerald-500/15 text-emerald-400',
  completada: 'bg-sky-500/15 text-sky-400',
  completed: 'bg-sky-500/15 text-sky-400',
  cancelada: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-red-500/15 text-red-400',
  pausada: 'bg-yellow-500/15 text-yellow-400',
  draft: 'bg-stone-500/15 text-stone-300',
  signed: 'bg-stone-500/15 text-stone-300',
  sent: 'bg-emerald-500/15 text-emerald-400',
  dispensed_partial: 'bg-sky-500/15 text-sky-400',
  dispensed_total: 'bg-sky-500/15 text-sky-400',
  expired: 'bg-amber-500/15 text-amber-300',
}

function formatPrescriptionDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Fecha no disponible'

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(parsed)
}

function toPrescriptionModalData(p: PatientPrescription) {
  return {
    id: p.id,
    medication: p.medication_name,
    dosage: p.dosage,
    frequency: p.frequency,
    duration: p.duration,
    instructions: p.instructions,
    diagnosis: p.diagnosis,
    notes: p.notes,
    doctorName: p.doctor_name,
    date: p.prescribed_date || p.start_date,
    cuir: p.cuir,
    vendorName: p.vendor_name,
    vendorId: p.vendor_id,
    signedPdfUrl: p.signed_pdf_url,
    hasDigitalArtifact: p.is_digital_artifact_ready,
    artifactWarning: p.artifact_warning,
    requiresStrictValidation: p.requires_strict_validation,
    source: p.source,
  }
}

function PrescriptionCard({
  prescription,
  onClick,
}: {
  prescription: PatientPrescription
  onClick: () => void
}) {
  const statusLabel = STATUS_LABEL[prescription.status] ?? prescription.status
  const statusColor = STATUS_COLOR[prescription.status] ?? 'bg-stone-500/15 text-stone-400'
  const subtitle = [prescription.doctor_name ? `Dr. ${prescription.doctor_name}` : 'Profesional tratante', formatPrescriptionDate(prescription.prescribed_date || prescription.start_date)].join(' · ')

  return (
    <div
      className="w-full text-left rounded-2xl border p-5 shadow-sm transition-all"
      style={{
        background: 'var(--au-surface)',
        borderColor: 'var(--au-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
           <h3 className="text-lg font-bold truncate" style={{ color: 'var(--au-text-primary)' }}>
            {prescription.medication_name}
          </h3>
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--au-text-tertiary)' }}>
            {subtitle}
          </p>
        </div>
         <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold shrink-0 ${statusColor}`}>
            {statusLabel}
          </span>
      </div>

      <div className="space-y-1 mb-4">
        {prescription.dosage && (
          <p className="text-sm font-medium" style={{ color: 'var(--au-text-secondary)' }}>
            {prescription.dosage}
          </p>
        )}
        {prescription.frequency && (
          <p className="text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
            {prescription.frequency}
            {prescription.duration ? ` · ${prescription.duration}` : ''}
          </p>
        )}
      </div>

      {prescription.artifact_warning && (
        <div
          className="mb-4 rounded-lg px-3 py-2 text-xs flex items-start gap-1.5"
          style={{ background: 'rgba(234,179,8,0.1)', color: '#ca8a04' }}
        >
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {prescription.artifact_warning}
        </div>
      )}

      {!prescription.artifact_warning && (
        <div
          className="mb-4 rounded-lg px-3 py-2 text-xs"
          style={{
            background: prescription.is_digital_artifact_ready ? 'rgba(16,185,129,0.08)' : 'var(--au-hover)',
            color: prescription.is_digital_artifact_ready ? '#34d399' : 'var(--au-text-tertiary)',
          }}
        >
          {prescription.is_digital_artifact_ready
            ? prescription.cuir
              ? `Receta electronica emitida. CUIR ${prescription.cuir}.`
              : 'Receta electronica con soporte verificable disponible.'
            : 'Detalle clinico disponible. La receta valida para farmacia solo se muestra cuando exista soporte verificable.'}
        </div>
      )}

      <div className="flex gap-2">
        {prescription.signed_pdf_url && (
          <a
            href={prescription.signed_pdf_url}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => event.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-white py-2.5 text-sm font-bold text-stone-700 shadow-sm transition-all hover:bg-stone-50 active:scale-[0.98]"
          >
            <ExternalLink className="h-4 w-4" />
            PDF firmado
          </a>
        )}
        <button
          type="button"
          onClick={onClick}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          <FileText className="h-4 w-4" />
          Ver detalle
        </button>
      </div>
    </div>
  )
}

export default function MedicalHistoryPage() {
  const { patient } = usePatientSession()
  const { prescriptions, loading, error } = useMedicalHistory(patient?.id)
  const [selectedPrescription, setSelectedPrescription] = useState<PatientPrescription | null>(null)

  return (
    <div
      className="min-h-screen pb-4"
      style={{ background: 'var(--au-bg)', color: 'var(--au-text-primary)' }}
    >
      {/* Header */}
      <div className="px-5 pt-8 pb-6">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(249,115,22,0.12)' }}
          >
            <Stethoscope className="h-5 w-5" style={{ color: 'var(--au-accent)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--au-text-primary)' }}>
            Mis Recetas
          </h1>
        </div>
        <p className="text-sm pl-1" style={{ color: 'var(--au-text-tertiary)' }}>
          Tus prescripciones registradas
        </p>
      </div>

      {/* Content */}
      <div className="px-5">
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div
              className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: 'var(--au-accent)', borderTopColor: 'transparent' }}
            />
            <p className="text-sm" style={{ color: 'var(--au-text-tertiary)' }}>
              Cargando recetas...
            </p>
          </div>
        )}

        {error && !loading && (
          <div
            className="rounded-2xl p-4 text-sm flex items-center gap-2 mb-4"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {prescriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full mb-4 bg-stone-100"
                >
                  <Pill className="h-8 w-8 text-stone-400" />
                </div>
                <p className="font-bold text-lg text-stone-900 mb-2">
                  Sin recetas activas
                </p>
                <p className="text-sm text-center text-stone-500 mb-6 max-w-xs">
                  Cuando exista una prescripcion registrada aparecera aqui. Solo mostraremos soporte valido para farmacia cuando haya un artefacto electronico verificable.
                </p>
                 <a 
                  href="/patients/appointments?type=telemedicine"
                  className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-6 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.97]"
                >
                  <CalendarPlus className="h-4 w-4" />
                  Solicitar consulta médica
                </a>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {prescriptions.map((p) => (
                  <PrescriptionCard
                    key={p.id}
                    prescription={p}
                    onClick={() => setSelectedPrescription(p)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {selectedPrescription && (
        <PrescriptionModal
          prescription={toPrescriptionModalData(selectedPrescription)}
          onClose={() => setSelectedPrescription(null)}
        />
      )}
    </div>
  )
}
