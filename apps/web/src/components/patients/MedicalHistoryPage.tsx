'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pill, AlertCircle, CalendarPlus, FileText, ExternalLink, ArrowRight } from 'lucide-react'
import { useMedicalHistory } from '@/hooks/patients/useMedicalHistory'
import { usePatientSession } from '@/hooks/patients/usePatientSession'
import { PrescriptionModal } from '@/components/patients/medical/PrescriptionModal'
import type { PatientPrescription } from '@/lib/patients/types/medical-history'

const STATUS_LABEL: Record<string, string> = {
  activa: 'Activa', active: 'Activa', completada: 'Completada', completed: 'Completada',
  cancelada: 'Cancelada', cancelled: 'Cancelada', pausada: 'Pausada', draft: 'Borrador',
  signed: 'Firmada', sent: 'Emitida', dispensed_partial: 'Parcial', dispensed_total: 'Dispensada', expired: 'Vencida',
}

const STATUS_STYLE: Record<string, string> = {
  activa: 'bg-neutral-900 text-white', active: 'bg-neutral-900 text-white',
  sent: 'bg-neutral-900 text-white', dispensed_total: 'bg-sky-500 text-white',
  dispensed_partial: 'bg-neutral-600 text-white', completed: 'bg-neutral-400 text-white',
  completada: 'bg-neutral-400 text-white', expired: 'bg-neutral-200 text-neutral-500',
  cancelled: 'bg-neutral-200 text-neutral-500', cancelada: 'bg-neutral-200 text-neutral-500',
  draft: 'bg-neutral-100 text-neutral-500', signed: 'bg-neutral-100 text-neutral-500',
  pausada: 'bg-neutral-200 text-neutral-600',
}

function formatDate(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
}

function getVerifyUrl(cuir: string | null): string | null {
  if (!cuir) return null
  return `/verify/${encodeURIComponent(cuir)}`
}

function getDownloadablePdfUrl(signedPdfUrl: string | null, verifyUrl: string | null): string | null {
  if (!signedPdfUrl) return null
  if (verifyUrl && signedPdfUrl === verifyUrl) return null
  if (signedPdfUrl.includes('/verify/')) return null
  return signedPdfUrl
}

function toPrescriptionModalData(p: PatientPrescription) {
  return {
    id: p.id, medication: p.medication_name, dosage: p.dosage, frequency: p.frequency,
    duration: p.duration, instructions: p.instructions, diagnosis: p.diagnosis, notes: p.notes,
    doctorName: p.doctor_name, date: p.prescribed_date || p.start_date, cuir: p.cuir,
    vendorName: p.vendor_name, vendorId: p.vendor_id, signedPdfUrl: p.signed_pdf_url,
    hasDigitalArtifact: p.is_digital_artifact_ready, artifactWarning: p.artifact_warning,
    requiresStrictValidation: p.requires_strict_validation, source: p.source,
  }
}

function PrescriptionCard({ prescription, onClick, index }: {
  prescription: PatientPrescription; onClick: () => void; index: number
}) {
  const statusLabel = STATUS_LABEL[prescription.status] ?? prescription.status
  const statusStyle = STATUS_STYLE[prescription.status] ?? 'bg-neutral-100 text-neutral-500'
  const doctorName = prescription.doctor_name ? `Dr. ${prescription.doctor_name}` : 'Profesional'
  const dateStr = formatDate(prescription.prescribed_date || prescription.start_date)
  const verifyUrl = getVerifyUrl(prescription.cuir)
  const downloadablePdfUrl = getDownloadablePdfUrl(prescription.signed_pdf_url, verifyUrl)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      whileHover={{ y: -4 }}
      className="group border border-neutral-200 rounded-2xl p-6 hover:border-neutral-900 transition-all bg-white"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-neutral-900 truncate">
            {prescription.medication_name || 'Prescripción médica'}
          </h3>
          <p className="text-sm text-neutral-500 mt-0.5">{doctorName} · {dateStr}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold shrink-0 ${statusStyle}`}>
          {statusLabel}
        </span>
      </div>

      {prescription.dosage && (
        <p className="text-neutral-700 mb-1">{prescription.dosage}</p>
      )}
      {prescription.frequency && (
        <p className="text-sm text-neutral-500 mb-4">
          {prescription.frequency}{prescription.duration ? ` · ${prescription.duration}` : ''}
        </p>
      )}

      {prescription.cuir && (
        <div className="mb-4 rounded-xl bg-neutral-50 border border-neutral-100 px-4 py-3 text-sm text-neutral-600">
          CUIR: <span className="font-mono font-medium text-neutral-900">{prescription.cuir}</span>
        </div>
      )}

      <div className="flex gap-3">
        {downloadablePdfUrl && (
          <a
            href={downloadablePdfUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex-1 flex items-center justify-center gap-2 py-3 border border-neutral-200 text-neutral-700 rounded-full font-medium hover:border-neutral-900 transition-all"
          >
            <ExternalLink className="size-4" /> PDF
          </a>
        )}
        <button
          type="button"
          onClick={onClick}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all"
        >
          <FileText className="size-4" /> Ver detalle
        </button>
      </div>
    </motion.div>
  )
}

export default function MedicalHistoryPage() {
  const { patient } = usePatientSession()
  const { prescriptions, loading, error } = useMedicalHistory(patient?.id)
  const [selectedPrescription, setSelectedPrescription] = useState<PatientPrescription | null>(null)

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-neutral-900 px-6 lg:px-12 pt-16 pb-20">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Pill className="size-3.5" />
            {prescriptions.length} {prescriptions.length === 1 ? 'receta' : 'recetas'}
          </motion.div>

          <motion.h1
            className="text-4xl lg:text-5xl text-white mb-4 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Mis Recetas
          </motion.h1>
          <motion.p
            className="text-lg text-white/60 max-w-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Prescripciones registradas y recetas electrónicas
          </motion.p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-7xl mx-auto px-6 lg:px-12 -mt-8 pb-32">
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <motion.div
              className="size-12 rounded-full border-2 border-neutral-300 border-t-neutral-900 animate-spin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />
            <p className="mt-4 text-neutral-500">Cargando recetas...</p>
          </div>
        )}

        {error && !loading && (
          <motion.div
            className="rounded-2xl border border-red-200 bg-red-50 p-6 flex items-center gap-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <AlertCircle className="size-5 text-red-500 shrink-0" />
            <p className="text-red-700">{error}</p>
          </motion.div>
        )}

        {!loading && !error && (
          <>
            {prescriptions.length === 0 ? (
              <motion.div
                className="text-center py-24"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="size-20 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-8">
                  <Pill className="size-10 text-neutral-400" />
                </div>
                <h2 className="text-3xl text-neutral-900 mb-4">Sin recetas activas</h2>
                <p className="text-neutral-500 mb-10 max-w-md mx-auto">
                  Cuando tu médico te prescriba un medicamento, aparecerá aquí con verificación digital.
                </p>
                <motion.a
                  href="/patients/appointments?type=telemedicine"
                  className="group inline-flex items-center gap-2 px-7 py-4 bg-neutral-900 text-white rounded-full font-medium hover:bg-neutral-800 transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <CalendarPlus className="size-5" />
                  Solicitar consulta médica
                  <ArrowRight className="size-4 group-hover:translate-x-1 transition-transform" />
                </motion.a>
              </motion.div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {prescriptions.map((p, i) => (
                  <PrescriptionCard
                    key={p.id}
                    prescription={p}
                    onClick={() => setSelectedPrescription(p)}
                    index={i}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {selectedPrescription && (
        <PrescriptionModal
          prescription={toPrescriptionModalData(selectedPrescription)}
          onClose={() => setSelectedPrescription(null)}
        />
      )}
    </div>
  )
}
