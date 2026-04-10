'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  RefreshCcw,
} from 'lucide-react'

interface CompletedGreenViewProps {
  downloadingPdf: boolean
  saving: boolean
  onDownloadPdf: () => Promise<void>
  onRedo: () => Promise<void>
}

const fadeSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] },
}

export default function CompletedGreenView({
  downloadingPdf,
  saving,
  onDownloadPdf,
  onRedo,
}: CompletedGreenViewProps) {
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)

  const handleContinuityRequest = useCallback(async () => {
    setRequesting(true)
    setRequestError(null)

    try {
      const res = await fetch('/api/patients/psychiatry/continuity-request', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'no_clinical_case') {
          setRequestError('No se encontró tu caso clínico. Completá la evaluación primero.')
        } else if (body.error === 'case_requires_clinical_review') {
          setRequestError('Tu caso requiere revisión clínica directa. No aplica para continuidad rápida.')
        } else {
          setRequestError('No se pudo crear la solicitud. Intentá de nuevo.')
        }
        return
      }

      window.location.href = '/patients/continuity/status'
    } catch {
      setRequestError('Error de conexión. Verificá tu internet e intentá de nuevo.')
    } finally {
      setRequesting(false)
    }
  }, [])

  return (
    <motion.div className="border-t border-emerald-100/40 px-6 py-10 sm:px-8" {...fadeSlide}>
      <div className="mx-auto max-w-3xl overflow-hidden rounded-[28px] border border-emerald-100 bg-gradient-to-b from-emerald-50/50 via-white to-white shadow-lg shadow-emerald-900/[0.03]">
        <div className="px-8 pt-10 pb-2 text-center">
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-100/60 [animation-duration:2s]" />
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
          </div>
          <h2 className="mt-6 font-heading text-3xl font-semibold tracking-tight text-slate-950">
            Evaluación completada
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-slate-500">
            Tu perfil clínico fue procesado. Podés solicitar continuidad rápida de tu tratamiento
            o descargar tu evaluación.
          </p>
        </div>

        {requestError && (
          <div className="mx-8 mt-4 rounded-xl border border-red-100 bg-red-50/80 px-4 py-3 text-sm font-medium text-red-600">
            {requestError}
          </div>
        )}

        <div className="flex flex-col items-center justify-center gap-3 px-8 pb-10 pt-6 sm:flex-row">
          <button
            type="button"
            onClick={() => { void handleContinuityRequest() }}
            disabled={requesting}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-200/40 transition-all hover:bg-emerald-600 hover:shadow-lg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requesting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ArrowRight className="h-4 w-4" />}
            Solicitar Continuidad Rápida
          </button>
          <button
            type="button"
            onClick={() => { void onDownloadPdf() }}
            disabled={downloadingPdf}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-medium text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {downloadingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Ver Informe PDF
          </button>
          <button
            type="button"
            onClick={() => { void onRedo() }}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-400 transition-all hover:text-slate-600"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />}
            Recomenzar
          </button>
        </div>
      </div>
    </motion.div>
  )
}
