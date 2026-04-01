'use client'

import { useEffect, useState } from 'react'
import { FileText, Pill, Stethoscope, AlertCircle } from 'lucide-react'
import { useMedicalHistory } from '@/hooks/patients/useMedicalHistory'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { PrescriptionModal } from '@/components/patients/medical/PrescriptionModal'
import { MedicalHistoryTimeline } from '@/components/patients/medical-history/MedicalHistoryTimeline'
import type { PatientPrescription } from '@/lib/patients/types/medical-history'

type Tab = 'prescriptions' | 'timeline'

const STATUS_LABEL: Record<string, string> = {
  activa: 'Activa',
  active: 'Activa',
  completada: 'Completada',
  completed: 'Completada',
  cancelada: 'Cancelada',
  cancelled: 'Cancelada',
  pausada: 'Pausada',
}

const STATUS_COLOR: Record<string, string> = {
  activa: 'bg-emerald-500/15 text-emerald-400',
  active: 'bg-emerald-500/15 text-emerald-400',
  completada: 'bg-sky-500/15 text-sky-400',
  completed: 'bg-sky-500/15 text-sky-400',
  cancelada: 'bg-red-500/15 text-red-400',
  cancelled: 'bg-red-500/15 text-red-400',
  pausada: 'bg-yellow-500/15 text-yellow-400',
}

function toPrescriptionModalData(p: PatientPrescription) {
  return {
    id: p.id,
    medication: p.medication_name,
    dosage: p.dosage,
    frequency: p.frequency,
    duration: p.duration,
    instructions: p.instructions,
    diagnosis: null,
    notes: p.notes,
    doctorName: 'Tu médico',
    date: p.prescribed_date || p.start_date,
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

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl border p-4 transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{
        background: 'var(--au-surface)',
        borderColor: 'var(--au-border)',
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl flex-shrink-0"
            style={{ background: 'rgba(249,115,22,0.12)' }}
          >
            <Pill className="h-4 w-4" style={{ color: 'var(--au-accent)' }} />
          </div>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--au-text-tertiary)' }}>
          {new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
            .format(new Date(prescription.prescribed_date || prescription.start_date))}
        </span>
      </div>

      <h3 className="font-semibold mb-1" style={{ color: 'var(--au-text-primary)' }}>
        {prescription.medication_name}
      </h3>

      <div className="space-y-1">
        {prescription.dosage && (
          <p className="text-sm" style={{ color: 'var(--au-text-secondary)' }}>
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

      {prescription.side_effects_warning && (
        <div
          className="mt-3 rounded-lg px-3 py-2 text-xs flex items-start gap-1.5"
          style={{ background: 'rgba(234,179,8,0.1)', color: '#ca8a04' }}
        >
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          {prescription.side_effects_warning}
        </div>
      )}
    </button>
  )
}

export default function MedicalHistoryPage() {
  const { patient } = usePatientSession()
  const { summary, timeline, prescriptions, loading, error } = useMedicalHistory(patient?.id)
  const [activeTab, setActiveTab] = useState<Tab>('prescriptions')
  const [selectedPrescription, setSelectedPrescription] = useState<PatientPrescription | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const tab = params.get('tab')
    if (tab === 'timeline') setActiveTab('timeline')
    else setActiveTab('prescriptions')
  }, [])

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: 'prescriptions', label: 'Recetas', icon: Pill, count: prescriptions.length },
    { key: 'timeline', label: 'Historial', icon: FileText, count: summary ? (summary.active_conditions_count + prescriptions.length) : undefined },
  ]

  return (
    <div
      className="min-h-screen pb-24"
      style={{ background: 'var(--au-bg)', color: 'var(--au-text-primary)' }}
    >
      {/* Header */}
      <div className="px-5 pt-8 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{ background: 'rgba(249,115,22,0.12)' }}
          >
            <Stethoscope className="h-5 w-5" style={{ color: 'var(--au-accent)' }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--au-text-primary)' }}>
            Historial médico
          </h1>
        </div>
        <p className="text-sm pl-1" style={{ color: 'var(--au-text-tertiary)' }}>
          Tus recetas y registros clínicos
        </p>
      </div>

      {/* Summary counts */}
      {summary && (
        <div className="px-5 grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Recetas', value: prescriptions.length, icon: '💊' },
            { label: 'Condiciones', value: summary.active_conditions_count, icon: '🩺' },
            { label: 'Medicamentos activos', value: summary.active_medications_count, icon: '✅' },
          ].map(({ label, value, icon }) => (
            <div
              key={label}
              className="rounded-2xl p-3 text-center"
              style={{ background: 'var(--au-surface)', border: '1px solid var(--au-border)' }}
            >
              <div className="text-xl mb-1">{icon}</div>
              <div className="text-lg font-bold" style={{ color: 'var(--au-text-primary)' }}>{value}</div>
              <div className="text-[10px] leading-tight" style={{ color: 'var(--au-text-tertiary)' }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="px-5 mb-5">
        <div
          className="flex rounded-2xl p-1 gap-1"
          style={{ background: 'var(--au-surface)', border: '1px solid var(--au-border)' }}
        >
          {tabs.map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-sm font-medium transition-all"
              style={
                activeTab === key
                  ? { background: 'var(--au-accent)', color: '#fff' }
                  : { color: 'var(--au-text-secondary)' }
              }
            >
              <Icon className="h-4 w-4" />
              {label}
              {count !== undefined && count > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={
                    activeTab === key
                      ? { background: 'rgba(255,255,255,0.25)', color: '#fff' }
                      : { background: 'var(--au-hover)', color: 'var(--au-text-tertiary)' }
                  }
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
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
              Cargando historial...
            </p>
          </div>
        )}

        {error && !loading && (
          <div
            className="rounded-2xl p-4 text-sm flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && activeTab === 'prescriptions' && (
          <>
            {prescriptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-3xl"
                  style={{ background: 'var(--au-surface)', border: '1px solid var(--au-border)' }}
                >
                  <Pill className="h-8 w-8" style={{ color: 'var(--au-text-tertiary)' }} />
                </div>
                <p className="font-medium" style={{ color: 'var(--au-text-primary)' }}>
                  Sin recetas
                </p>
                <p className="text-sm text-center max-w-xs" style={{ color: 'var(--au-text-tertiary)' }}>
                  Tus recetas médicas aparecerán aquí cuando tu médico las genere
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

        {!loading && !error && activeTab === 'timeline' && timeline && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <MedicalHistoryTimeline timeline={timeline as any} />
        )}

        {!loading && !error && activeTab === 'timeline' && !timeline && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <FileText className="h-12 w-12" style={{ color: 'var(--au-text-tertiary)' }} />
            <p className="text-sm" style={{ color: 'var(--au-text-tertiary)' }}>
              No hay registros en el historial
            </p>
          </div>
        )}
      </div>

      {/* Prescription detail modal */}
      {selectedPrescription && (
        <PrescriptionModal
          prescription={toPrescriptionModalData(selectedPrescription)}
          onClose={() => setSelectedPrescription(null)}
        />
      )}
    </div>
  )
}
