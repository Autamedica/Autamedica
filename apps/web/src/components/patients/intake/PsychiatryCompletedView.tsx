'use client'

import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Download,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import CompletedGreenView from '@/components/patients/CompletedGreenView'

const fadeSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
}

export interface PsychiatryCompletedViewProps {
  triagePriority: 'urgent' | 'priority' | 'routine'
  triageReasons: string[]
  downloadingPdf: boolean
  saving: boolean
  onDownloadPdf: () => void
  onRedo: () => void
}

export function PsychiatryCompletedView({
  triagePriority,
  triageReasons,
  downloadingPdf,
  saving,
  onDownloadPdf,
  onRedo,
}: PsychiatryCompletedViewProps) {
  if (triagePriority === 'urgent') {
    return (
      <motion.div className="border-t border-red-100/40 px-6 py-10 sm:px-8" {...fadeSlide}>
        <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-red-200 bg-gradient-to-b from-red-50/50 via-white to-white shadow-lg shadow-red-900/[0.03]">
          <div className="px-8 pt-10 pb-2 text-center">
            <div className="relative mx-auto h-16 w-16">
              <div className="absolute inset-0 animate-ping rounded-full bg-red-100/60 [animation-duration:2s]" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <h2 className="mt-6 font-heading text-2xl font-semibold tracking-tight text-slate-950 uppercase">
              Evaluación Sincrónica Prioritaria
            </h2>
            <div className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-700 bg-red-50/50 p-6 rounded-2xl border border-red-100/50 text-left">
              <p className="mb-4 font-medium text-red-800">
                Se han detectado factores de seguridad que requieren evaluación médica sincrónica.
                Un profesional debe hablar con vos directamente.
              </p>
              <ReasonsList reasons={triageReasons} dotColor="bg-red-400" />
            </div>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 px-8 pb-10 pt-6 sm:flex-row">
            <a
              href="/patients/appointments/new?priority=urgent&source=psychiatry-triage"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-red-200/40 transition-all hover:bg-red-700 hover:shadow-lg active:scale-[0.97]"
            >
              Agendar Evaluación Prioritaria
            </a>
            <PdfButton downloading={downloadingPdf} onClick={onDownloadPdf} label="Descargar Evaluación" />
          </div>
        </div>
      </motion.div>
    )
  }

  if (triagePriority === 'priority') {
    return (
      <motion.div className="border-t border-amber-100/40 px-6 py-10 sm:px-8" {...fadeSlide}>
        <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-amber-200 bg-gradient-to-b from-amber-50/50 via-white to-white shadow-lg shadow-amber-900/[0.03]">
          <div className="px-8 pt-10 pb-2 text-center">
            <div className="relative mx-auto h-16 w-16">
              <div className="absolute inset-0 animate-ping rounded-full bg-amber-100/60 [animation-duration:2s]" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
                <ShieldAlert className="h-8 w-8 text-amber-600" />
              </div>
            </div>
            <h2 className="mt-6 font-heading text-2xl font-semibold tracking-tight text-slate-950 uppercase">
              Revisión Clínica Dirigida
            </h2>
            <div className="mx-auto mt-4 max-w-lg text-[15px] leading-relaxed text-slate-700 bg-amber-50/50 p-6 rounded-2xl border border-amber-100/50 text-left">
              <p className="mb-4 font-medium text-amber-800">
                Tu caso requiere revisión clínica por parte del equipo médico.
                Esto no implica necesariamente una consulta sincrónica — el profesional evaluará
                la mejor vía de resolución y te contactará.
              </p>
              <ReasonsList reasons={triageReasons} dotColor="bg-amber-400" />
            </div>
            <p className="mx-auto mt-4 max-w-md text-sm text-slate-500">
              Tu evaluación ya fue enviada al equipo. Te notificaremos cuando haya una resolución
              o si se necesita una consulta adicional.
            </p>
          </div>
          <div className="flex flex-col items-center justify-center gap-3 px-8 pb-10 pt-6 sm:flex-row">
            <a
              href="/patients/continuity/status"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-amber-200/40 transition-all hover:bg-amber-600 hover:shadow-lg active:scale-[0.97]"
            >
              Ver Estado de mi Caso
            </a>
            <PdfButton downloading={downloadingPdf} onClick={onDownloadPdf} label="Descargar PDF" />
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <CompletedGreenView
      downloadingPdf={downloadingPdf}
      saving={saving}
      onDownloadPdf={async () => { onDownloadPdf() }}
      onRedo={async () => { onRedo() }}
    />
  )
}

function ReasonsList({ reasons, dotColor }: { reasons: string[]; dotColor: string }) {
  return (
    <ul className="space-y-2 text-slate-600">
      {reasons.map((r, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          {r}
        </li>
      ))}
    </ul>
  )
}

function PdfButton({ downloading, onClick, label }: { downloading: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={downloading}
      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {label}
    </button>
  )
}
