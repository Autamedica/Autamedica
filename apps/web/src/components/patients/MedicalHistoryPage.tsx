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

const STATUS_LABEL_PT: Record<string, string> = {
  activa: 'Ativa', active: 'Ativa', completada: 'Concluída', completed: 'Concluída',
  cancelada: 'Cancelada', cancelled: 'Cancelada', pausada: 'Pausada', draft: 'Rascunho',
  signed: 'Assinada', sent: 'Emitida', dispensed_partial: 'Parcial', dispensed_total: 'Dispensada', expired: 'Expirada',
}

const STATUS_STYLE: Record<string, string> = {
  activa: 'bg-[#10B981] text-white', active: 'bg-[#10B981] text-white',
  sent: 'bg-[#10B981] text-white', dispensed_total: 'bg-[#10B981] text-white',
  dispensed_partial: 'bg-neutral-600 text-white', completed: 'bg-neutral-400 text-white',
  completada: 'bg-neutral-400 text-white', expired: 'bg-neutral-200 text-neutral-500',
  cancelled: 'bg-neutral-200 text-neutral-500', cancelada: 'bg-neutral-200 text-neutral-500',
  draft: 'bg-neutral-100 text-neutral-500', signed: 'bg-neutral-100 text-neutral-500',
  pausada: 'bg-neutral-200 text-neutral-600',
}

function formatDate(value: string, locale = 'es-AR') {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
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

function PrescriptionCard({ prescription, onClick, index, locale }: {
  prescription: PatientPrescription; onClick: () => void; index: number; locale: string
}) {
  const isPortuguese = locale === 'pt-BR'
  const statusLabel = (isPortuguese ? STATUS_LABEL_PT[prescription.status] : STATUS_LABEL[prescription.status]) ?? prescription.status
  const statusStyle = STATUS_STYLE[prescription.status] ?? 'bg-neutral-100 text-neutral-500'
  const doctorName = prescription.doctor_name ? `Dr. ${prescription.doctor_name}` : (locale === 'pt-BR' ? 'Profissional' : 'Profesional')
  const dateStr = formatDate(prescription.prescribed_date || prescription.start_date, locale)
  const verifyUrl = getVerifyUrl(prescription.cuir)
  const downloadablePdfUrl = getDownloadablePdfUrl(prescription.signed_pdf_url, verifyUrl)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      whileHover={{ y: -4 }}
      className="group rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:border-[#10B981] sm:p-6"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-semibold text-neutral-900 truncate">
            {prescription.medication_name || (locale === 'pt-BR' ? 'Receita médica' : 'Prescripción médica')}
          </h3>
          <p className="text-sm text-neutral-500 mt-0.5">{doctorName} · {dateStr}</p>
          <p className="mt-1 text-[11px] font-semibold text-emerald-700">{prescription.source === 'memed_br' ? 'Memed BR' : prescription.source === 'prescriptions_core' ? 'RCTA / Core AR' : 'Historial clínico'}</p>
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
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
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
            className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 py-3 font-medium text-slate-700 transition-all hover:border-[#10B981]"
          >
            <ExternalLink className="size-4" /> PDF
          </a>
        )}
        <button
          type="button"
          onClick={onClick}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-full bg-[#10B981] py-3 font-medium text-white transition-all hover:bg-[#0D9488]"
        >
          <FileText className="size-4" /> {locale === 'pt-BR' ? 'Ver detalhes' : 'Ver detalle'}
        </button>
      </div>
    </motion.div>
  )
}

export default function MedicalHistoryPage() {
  const { patient } = usePatientSession()
  const { prescriptions, certificates, orders, loading, error } = useMedicalHistory(patient?.id)
  const [activeTab, setActiveTab] = useState<'prescriptions' | 'certificates' | 'orders'>('prescriptions')
  const patientCountry = (patient as unknown as { careCountry?: string; care_country?: string } | null)?.careCountry ?? (patient as unknown as { care_country?: string } | null)?.care_country
  const isPortuguese = patientCountry === 'BR' || (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('pt'))
  const locale = isPortuguese ? 'pt-BR' : 'es-AR'
  const [selectedPrescription, setSelectedPrescription] = useState<PatientPrescription | null>(null)

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <section className="bg-[#0F2537] px-6 lg:px-12 pt-10 pb-16">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white/80 rounded-full text-xs font-medium mb-6"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <Pill className="size-3.5" />
            {prescriptions.length} {isPortuguese ? (prescriptions.length === 1 ? 'receita' : 'receitas') : (prescriptions.length === 1 ? 'receta' : 'recetas')}
          </motion.div>

          <motion.h1
            className="text-4xl lg:text-5xl text-white mb-4 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {isPortuguese ? 'Minhas receitas' : 'Mis Recetas'}
          </motion.h1>
          <motion.p
            className="text-lg text-white/60 max-w-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {isPortuguese ? 'Receitas digitais e prescrições registradas' : 'Prescripciones registradas y recetas electrónicas'}
          </motion.p>
        </div>
      </section>

      {/* Content */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 -mt-8 pb-32">
        <div className="mb-5 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
          <button type="button" onClick={() => setActiveTab('prescriptions')} className={`min-h-11 rounded-xl px-2 text-xs font-semibold transition ${activeTab === 'prescriptions' ? 'bg-[#10B981] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{isPortuguese ? 'Receitas digitais' : 'Recetas digitales'}</button>
          <button type="button" onClick={() => setActiveTab('certificates')} className={`min-h-11 rounded-xl px-2 text-xs font-semibold transition ${activeTab === 'certificates' ? 'bg-[#10B981] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{isPortuguese ? 'Atestados' : 'Certificados / Atestados'}</button>
          <button type="button" onClick={() => setActiveTab('orders')} className={`min-h-11 rounded-xl px-2 text-xs font-semibold transition ${activeTab === 'orders' ? 'bg-[#10B981] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{isPortuguese ? 'Exames e ordens' : 'Órdenes y estudios'}</button>
        </div>
        {loading && (
          <div className="flex flex-col items-center justify-center py-24">
            <motion.div
              className="size-12 animate-spin rounded-full border-2 border-slate-200 border-t-[#10B981]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />
            <p className="mt-4 text-neutral-500">{isPortuguese ? 'Carregando receitas...' : 'Cargando recetas...'}</p>
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

        {!loading && !error && activeTab === 'prescriptions' && (
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
                <h2 className="text-3xl text-neutral-900 mb-4">{isPortuguese ? 'Nenhuma receita ativa' : 'Sin recetas activas'}</h2>
                <p className="text-neutral-500 mb-10 max-w-md mx-auto">
                  {isPortuguese ? 'Quando seu médico prescrever um medicamento, ele aparecerá aqui com verificação digital.' : 'Cuando tu médico te prescriba un medicamento, aparecerá aquí con verificación digital.'}
                </p>
                <motion.a
                  href="/patients/appointments?type=telemedicine"
                  className="group inline-flex min-h-12 items-center gap-2 px-7 py-4 bg-[#10B981] text-white rounded-full font-medium hover:bg-[#0D9488] transition-all"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <CalendarPlus className="size-5" />
                  {isPortuguese ? 'Agendar consulta médica' : 'Solicitar consulta médica'}
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
                    locale={locale}
                  />
                ))}
              </div>
            )}
          </>
        )}
        {!loading && !error && activeTab === 'certificates' && (
          <div className="grid gap-4 md:grid-cols-2">
            {certificates.length === 0 ? <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{isPortuguese ? 'Nenhum atestado foi emitido.' : 'Todavía no hay certificados ni atestados emitidos.'}</div> : certificates.map((certificate) => {
              const id = String(certificate.id ?? '')
              const status = String(certificate.status ?? 'draft')
              const type = String(certificate.certificate_type ?? (isPortuguese ? 'outro' : 'otro')).replace(/_/g, ' ')
              const code = String(certificate.cuir ?? '')
              const pdfUrl = `/api/doctors/certificates/${encodeURIComponent(id)}/pdf`
              return (
                <article key={id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="font-semibold capitalize text-slate-900">{type}</h3><p className="mt-1 text-xs text-slate-500">{formatDate(String(certificate.created_at ?? ''), locale)}</p></div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{status === 'signed' ? (isPortuguese ? 'Assinado' : 'Firmado') : status}</span>
                  </div>
                  {certificate.days_of_rest ? <p className="mt-3 text-sm text-slate-700">{String(certificate.days_of_rest)} {isPortuguese ? 'dias de afastamento' : 'días de reposo'}</p> : null}
                  {code && <p className="mt-3 text-xs text-slate-500">{isPortuguese ? 'Código de verificação' : 'Código de verificación'}: <span className="font-mono font-semibold text-slate-800">{code}</span></p>}
                  <div className="mt-4 flex gap-2">
                    {status === 'signed' && <a href={pdfUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl bg-[#10B981] px-3 text-xs font-semibold text-white hover:bg-[#0D9488]">{isPortuguese ? 'Abrir PDF assinado' : 'Abrir PDF firmado'}</a>}
                    {code && <a href={`/verify/${encodeURIComponent(code)}`} className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700">{isPortuguese ? 'Verificar' : 'Verificar'}</a>}
                  </div>
                </article>
              )
            })}
          </div>
        )}
        {!loading && !error && activeTab === 'orders' && (
          <div className="grid gap-4 md:grid-cols-2">
            {orders.length === 0 ? <div className="col-span-full rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{isPortuguese ? 'Nenhuma ordem ou exame registrado.' : 'Todavía no hay órdenes ni estudios registrados.'}</div> : orders.map((order) => {
              const id = String(order.id ?? '')
              const rawStatus = String(order.status ?? '').toLowerCase()
              const statusLabel = /available|disponible/.test(rawStatus) ? (isPortuguese ? 'Disponível' : 'Disponible')
                : /done|completed|performed|realizado/.test(rawStatus) ? (isPortuguese ? 'Realizado' : 'Realizado')
                : /pending|pendiente/.test(rawStatus) ? (isPortuguese ? 'Pendente' : 'Pendiente')
                : (isPortuguese ? 'Solicitado' : 'Solicitado')
              const code = String(order.cuir ?? '')
              const practices = Array.isArray(order.practices) ? (order.practices as unknown[]).map((item) => typeof item === 'string' ? item : String((item as Record<string, unknown>)?.name ?? '')).filter(Boolean).join(', ') : ''
              return (
                <article key={id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-slate-900">{String(order.study_type ?? (isPortuguese ? 'Estudo diagnóstico' : 'Estudio diagnóstico'))}</h3><p className="mt-1 text-xs text-slate-500">{formatDate(String(order.created_at ?? ''), locale)}</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">{statusLabel}</span></div>
                  {practices && <p className="mt-3 text-sm text-slate-700">{practices}</p>}
                  {order.diagnosis && <p className="mt-2 text-xs text-slate-500">{String(order.diagnosis)}</p>}
                  {code && <p className="mt-3 text-xs text-slate-500">CUIR: <span className="font-mono font-semibold text-slate-800">{code}</span></p>}
                  {code && <a href={`/verify/${encodeURIComponent(code)}`} className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700">{isPortuguese ? 'Verificar ordem' : 'Verificar orden'}</a>}
                </article>
              )
            })}
          </div>
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
