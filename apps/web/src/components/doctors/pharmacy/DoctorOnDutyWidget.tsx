import { useState } from 'react'
import {
  Activity,
  AlertCircle,
  Building2,
  Clock,
  FileText,
  Loader2,
  Pill,
  Power,
  RefreshCw,
  User,
  Video,
} from 'lucide-react'
import { useDoctorOnDuty } from '@/hooks/doctors/useDoctorOnDuty'

interface DoctorOnDutyWidgetProps {
  className?: string
  compact?: boolean
}

export function DoctorOnDutyWidget({ className = '', compact = false }: DoctorOnDutyWidgetProps) {
  const {
    onDuty,
    since,
    loading,
    toggling,
    claimingId,
    queue,
    queueCount,
    error,
    toggleDuty,
    claimPatient,
    refreshQueue,
  } = useDoctorOnDuty()

  const [expanded, setExpanded] = useState(true)

  const handleClaim = async (requestId: string) => {
    const result = await claimPatient(requestId)
    if (result?.doctorRoomUrl) {
      // Direct navigation to doctor videocall room
      window.location.href = result.doctorRoomUrl
    }
  }

  if (loading) {
    return (
      <div className={`p-4 rounded-2xl bg-am-surface-800/80 border border-am-surface-700/60 animate-pulse flex items-center justify-between ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-am-surface-700/60" />
          <div>
            <div className="w-32 h-3.5 bg-am-surface-700/60 rounded mb-1" />
            <div className="w-20 h-2.5 bg-am-surface-700/40 rounded" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className={`rounded-2xl border transition-all duration-300 ${
        onDuty
          ? 'bg-gradient-to-br from-am-surface-800/95 via-am-surface-800 to-emerald-950/20 border-emerald-500/40 shadow-xl shadow-emerald-950/20'
          : 'bg-am-surface-800/80 border-am-surface-700/60 shadow-md'
      } p-4 sm:p-5 ${className}`}
    >
      {/* Header & Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
              onDuty
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                : 'bg-am-surface-700 text-am-surface-400'
            }`}
          >
            <Pill className="w-5 h-5" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-white">
                Guardia Farmacia / Consultas Exprés
              </h3>
              {onDuty ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-[10px] font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  DISPONIBLE
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-am-surface-700/60 text-am-surface-400 text-[10px] font-medium">
                  DESCONECTADO
                </span>
              )}
            </div>
            <p className="text-xs text-am-surface-400">
              {onDuty
                ? `Activo para recetas y videoconsultas inmediatas en mostrador ${since ? `• desde ${new Date(since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
                : 'Activa la guardia para recibir pacientes en espera desde farmacias'}
            </p>
          </div>
        </div>

        {/* Action Toggle Switch */}
        <div className="flex items-center gap-2 self-end sm:self-center">
          {onDuty && (
            <button
              type="button"
              onClick={() => void refreshQueue()}
              title="Actualizar cola"
              className="p-2 rounded-xl bg-am-surface-700/50 hover:bg-am-surface-700 text-am-surface-300 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            disabled={toggling}
            onClick={() => void toggleDuty(!onDuty)}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-md ${
              onDuty
                ? 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40'
                : 'bg-gradient-to-r from-am-primary-600 to-emerald-600 hover:from-am-primary-500 hover:to-emerald-500 text-white shadow-emerald-950/40'
            } disabled:opacity-50`}
          >
            {toggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Power className="w-3.5 h-3.5" />
            )}
            <span>{onDuty ? 'Pausar Guardia' : 'Iniciar Guardia'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Queue View when On-Duty */}
      {onDuty && !compact && (
        <div className="mt-4 pt-4 border-t border-am-surface-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-am-surface-200">
                Pacientes en Espera
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  queueCount > 0
                    ? 'bg-emerald-500 text-white animate-pulse'
                    : 'bg-am-surface-700 text-am-surface-400'
                }`}
              >
                {queueCount}
              </span>
            </div>

            {queueCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-am-primary-400 hover:text-am-primary-300 transition"
              >
                {expanded ? 'Ocultar' : 'Ver cola'}
              </button>
            )}
          </div>

          {queueCount === 0 ? (
            <div className="py-5 px-4 rounded-xl bg-am-surface-900/60 border border-am-surface-700/40 text-center flex flex-col items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-400/60 mb-1.5 animate-pulse" />
              <p className="text-xs text-am-surface-300 font-medium">
                Sin pacientes esperando en este momento
              </p>
              <p className="text-[11px] text-am-surface-500 mt-0.5">
                Te notificaremos con un tono sonoro en cuanto una farmacia ingrese una solicitud.
              </p>
            </div>
          ) : (
            expanded && (
              <div className="space-y-2.5">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-xl bg-am-surface-900/90 border border-am-surface-700/70 hover:border-emerald-500/50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-am-surface-400" />
                          {item.patientName}
                        </span>
                        <span className="text-[11px] text-am-surface-400">
                          (DNI {item.patientDni})
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-am-surface-800 text-am-surface-300 border border-am-surface-700">
                          <Building2 className="w-3 h-3 text-am-primary-400" />
                          {item.pharmacyName}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-am-surface-300">
                        <span className="flex items-center gap-1 text-am-primary-300 font-medium truncate max-w-[280px]">
                          <FileText className="w-3 h-3 text-am-primary-400" />
                          {item.reason}
                        </span>
                        <span className="flex items-center gap-1 text-am-surface-400">
                          <Clock className="w-3 h-3" />
                          Esperando hace {item.minutesWaiting} min
                        </span>
                      </div>
                    </div>

                    <div className="self-end sm:self-center">
                      <button
                        type="button"
                        disabled={claimingId === item.id}
                        onClick={() => void handleClaim(item.id)}
                        className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition shadow-md shadow-emerald-950/40 flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50"
                      >
                        {claimingId === item.id ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Conectando...</span>
                          </>
                        ) : (
                          <>
                            <Video className="w-3.5 h-3.5" />
                            <span>Atender Paciente</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
