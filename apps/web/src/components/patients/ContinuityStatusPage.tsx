'use client'

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  Pill,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'

interface ContinuityRequest {
  id: string
  intent: string
  triageStatus: 'pending' | 'acknowledged' | 'in_progress' | 'resolved' | 'escalated'
  priorityRank: number
  vertical: string
  riskOfInterruption: string
  medication: { name: string; dose: string; daysRemaining: number | null } | null
  assignedDoctorId: string | null
  acknowledgedAt: string | null
  resolvedAt: string | null
  resolutionDeadline: string | null
  createdAt: string
  updatedAt: string
}

const STATUS_DISPLAY: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Solicitud recibida', color: 'text-sky-600 bg-sky-50 border-sky-200', icon: Clock },
  acknowledged: { label: 'En revisión médica', color: 'text-amber-600 bg-amber-50 border-amber-200', icon: UserCheck },
  in_progress: { label: 'En proceso', color: 'text-blue-600 bg-blue-50 border-blue-200', icon: Loader2 },
  resolved: { label: 'Resuelto', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  escalated: { label: 'Derivado a consulta', color: 'text-red-600 bg-red-50 border-red-200', icon: ShieldCheck },
}

export default function ContinuityStatusPage() {
  const [loading, setLoading] = useState(true)
  const [request, setRequest] = useState<ContinuityRequest | null>(null)
  const [status, setStatus] = useState<string>('none')

  const fetchStatus = useCallback(async () => {
    try {
      const json = await fetchApi<{ status: string; request: ContinuityRequest | null }>(
        '/api/patients/psychiatry/continuity-request'
      )
      setStatus(json.status)
      setRequest(json.request)
    } catch (err) {
      logger.error('[ContinuityStatusPage] Failed to fetch status', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchStatus() }, [fetchStatus])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f8fbff] via-white to-[#f0f9ff]">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-500" />
          <p className="mt-4 text-sm text-slate-500">Cargando estado...</p>
        </div>
      </div>
    )
  }

  if (status === 'none' || !request) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f8fbff] via-white to-[#f0f9ff] p-6">
        <div className="max-w-md rounded-3xl border border-slate-100 bg-white p-8 text-center shadow-xl">
          <Clock className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-xl font-semibold text-slate-800">Sin solicitudes activas</h2>
          <p className="mt-2 text-sm text-slate-500">
            No tenés solicitudes de continuidad en curso. Si completaste tu evaluación psiquiátrica, podés solicitar continuidad desde tu historial.
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <a
              href="/patients/psychiatry"
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-sky-600"
            >
              Ir a evaluación psiquiátrica
            </a>
            <a
              href="/patients/dashboard"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-700"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </a>
          </div>
        </div>
      </div>
    )
  }

  const display = STATUS_DISPLAY[request.triageStatus] ?? STATUS_DISPLAY.pending
  const StatusIcon = display.icon

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="bg-neutral-900 px-6 lg:px-12 pt-16 pb-20">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium mb-6 ${display.color}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <StatusIcon className="size-3.5" />
            {display.label}
          </motion.div>
          <motion.h1
            className="text-4xl lg:text-5xl text-white mb-4 leading-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            Estado de tu solicitud
          </motion.h1>
          <motion.p
            className="text-lg text-white/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            Continuidad de tratamiento psiquiátrico
          </motion.p>
        </div>
      </section>

      <div className="max-w-3xl mx-auto px-6 lg:px-12 -mt-8 pb-24">
        <motion.div
          className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-lg"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >

          {/* Status Badge */}
          <div className="px-8 pt-6">
            <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${display.color}`}>
              <StatusIcon className="h-4 w-4" />
              {display.label}
            </div>
          </div>

          {/* Medication Info */}
          {request.medication && (
            <div className="mx-8 mt-6 rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100">
                  <Pill className="h-5 w-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{request.medication.name}</p>
                  <p className="text-xs text-slate-500">{request.medication.dose}</p>
                </div>
              </div>
              {request.medication.daysRemaining !== null && (
                <p className={`mt-3 text-xs font-medium ${
                  request.medication.daysRemaining <= 1 ? 'text-red-600' :
                  request.medication.daysRemaining <= 3 ? 'text-amber-600' : 'text-slate-500'
                }`}>
                  {request.medication.daysRemaining === 0
                    ? 'Sin medicación disponible'
                    : `${request.medication.daysRemaining} días restantes`}
                </p>
              )}
            </div>
          )}

          {/* Timeline */}
          <div className="px-8 py-6">
            <div className="space-y-4">
              <TimelineStep
                label="Solicitud recibida"
                date={request.createdAt}
                done
              />
              <TimelineStep
                label="En revisión médica"
                date={request.acknowledgedAt}
                done={!!request.acknowledgedAt}
              />
              <TimelineStep
                label="Resolución"
                date={request.resolvedAt}
                done={!!request.resolvedAt}
              />
            </div>

            {request.resolutionDeadline && request.triageStatus !== 'resolved' && (
              <p className="mt-4 text-xs text-slate-400">
                Plazo estimado de resolución: {new Date(request.resolutionDeadline).toLocaleDateString('es-AR', {
                  day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="border-t border-slate-100 px-8 py-6">
            <a
              href="/patients/dashboard"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-all hover:shadow-md"
            >
              <ArrowLeft className="h-4 w-4" />
              Volver al inicio
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

function TimelineStep({ label, date, done }: { label: string; date: string | null; done: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex h-6 w-6 items-center justify-center rounded-full ${
        done ? 'bg-emerald-100' : 'border-2 border-slate-200 bg-white'
      }`}>
        {done && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
      </div>
      <div>
        <p className={`text-sm font-medium ${done ? 'text-slate-800' : 'text-slate-400'}`}>{label}</p>
        {date && (
          <p className="text-xs text-slate-400">
            {new Date(date).toLocaleDateString('es-AR', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
          </p>
        )}
      </div>
    </div>
  )
}
