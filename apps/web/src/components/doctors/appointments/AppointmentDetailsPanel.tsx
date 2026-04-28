'use client'

import { useState, useEffect } from 'react'
import { 
  Calendar, Clock, Video, User,
  FileText, Trash2, Edit3, CheckCircle2, 
  XCircle, AlertCircle, UserPlus, Send, Copy, X, Loader2,
  Activity,
  type LucideIcon
} from 'lucide-react'
import type { Appointment, AppointmentStatus } from '@autamedica/types'
import { getCallWindowStatus } from '@/lib/calls/lib/call-error-messages'
import { StartCallButton } from '../calls/StartCallButton'
import { fetchApi } from '@/lib/api-client'

interface AppointmentDetailsPanelProps {
  appointment: Appointment
  patientName: string
  doctorId: string
  onEdit: () => void
  onStatusChange: (status: AppointmentStatus) => Promise<void>
}

const STATUS_CONFIG: Record<string, { label: string; icon: LucideIcon; color: string; bg: string }> = {
  scheduled: { label: 'Programado', icon: Calendar, color: 'text-am-surface-600', bg: 'bg-am-surface-100' },
  confirmed: { label: 'Confirmado', icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-100' },
  in_progress: { label: 'En curso', icon: Activity, color: 'text-sky-700', bg: 'bg-sky-100' },
  completed: { label: 'Completado', icon: CheckCircle2, color: 'text-slate-700', bg: 'bg-slate-100' },
  cancelled: { label: 'Cancelado', icon: XCircle, color: 'text-red-700', bg: 'bg-red-100' },
  no_show: { label: 'Ausente', icon: AlertCircle, color: 'text-amber-700', bg: 'bg-amber-100' },
}

export function AppointmentDetailsPanel({
  appointment,
  patientName,
  onEdit,
  onStatusChange
}: AppointmentDetailsPanelProps) {
  const [showShareModal, setShowShareModal] = useState(false)
  const status = STATUS_CONFIG[appointment.status ?? 'scheduled'] ?? STATUS_CONFIG.scheduled
  const start = new Date(appointment.start_time)
  const timeStr = start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const dateStr = start.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  
  const windowStatus = getCallWindowStatus(appointment)
  const isTelemedicine = appointment.type === 'telemedicine'
  const isGuest = !appointment.patient_id && appointment.notes?.includes('[INVITADO:')

  return (
    <div className="flex h-full flex-col bg-white animate-in fade-in duration-300 relative">
      {/* Header */}
      <header className="border-b border-am-surface-100 bg-am-surface-50/30 px-5 py-6 2xl:px-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${status.bg} ${status.color}`}>
                {status.label}
              </div>
              {isGuest && (
                <div className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-sky-100 text-sky-700 border border-sky-200">
                  Invitado Externo
                </div>
              )}
            </div>
            <h2 className="mt-4 truncate text-2xl font-bold tracking-tight text-am-surface-900 capitalize 2xl:text-3xl">
              {patientName}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-am-surface-500">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                {dateStr}
              </div>
              <div className="hidden h-1 w-1 rounded-full bg-am-surface-200 sm:block" />
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Clock className="h-4 w-4" />
                {timeStr} ({appointment.duration_minutes} min)
              </div>
            </div>
          </div>

          <div className="flex shrink-0 gap-2">
            <button
              onClick={onEdit}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-am-surface-200 bg-white text-am-surface-600 transition hover:bg-am-surface-50 shadow-am-sm"
              title="Editar cita"
            >
              <Edit3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => onStatusChange('cancelled')}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 bg-white text-red-500 transition hover:bg-red-50 shadow-am-sm"
              title="Cancelar cita"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 scrollbar-thin 2xl:p-7">
        <div className="grid gap-6 2xl:grid-cols-2 2xl:gap-8">
          <div className="space-y-6 2xl:space-y-8">
            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-am-surface-400">Detalles de la consulta</h3>
              <div className="mt-4 grid gap-4">
                <div className="rounded-2xl border border-am-surface-100 p-4 transition hover:border-am-surface-200">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-am-surface-100 p-2 text-am-surface-600">
                      <User className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-am-surface-400">Modalidad</p>
                      <p className="text-sm font-bold text-am-surface-900">
                        {appointment.type === 'telemedicine' ? 'Videoconsulta' : 'Presencial'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-am-surface-100 p-4 transition hover:border-am-surface-200">
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-am-surface-100 p-2 text-am-surface-600">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase text-am-surface-400">Ubicación</p>
                      <p className="text-sm font-bold text-am-surface-900">
                        {appointment.location || (appointment.type === 'telemedicine' ? 'Consultorio Virtual' : 'No especificada')}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-am-surface-400">Notas clínicas</h3>
              <div className="mt-4 rounded-2xl border border-am-surface-100 bg-am-surface-50/50 p-5">
                <div className="flex items-start gap-3">
                  <FileText className="mt-0.5 h-4 w-4 text-am-surface-400" />
                  <p className="text-sm leading-relaxed text-am-surface-700 italic">
                    {appointment.notes?.replace(/\[INVITADO:[^\]]+\]/, '').trim() || 'Sin observaciones para este turno.'}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="space-y-6 2xl:space-y-8">
            {isTelemedicine && (
              <section className="rounded-3xl border border-am-doctor-100 bg-am-doctor-50/50 p-5 2xl:p-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-am-doctor-100 p-2 text-am-doctor-600">
                    <Video className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-am-doctor-900">Telemedicina</h3>
                </div>

                <div className="mt-6 space-y-4">
                  <div className={`rounded-2xl border p-4 ${windowStatus.isOpen ? 'bg-white border-emerald-100' : 'bg-am-surface-100 border-am-surface-200 opacity-60'}`}>
                    <p className="text-[10px] font-bold uppercase text-am-surface-400">Ventana de conexión</p>
                    <p className={`mt-1 text-sm font-bold ${windowStatus.isOpen ? 'text-emerald-700' : 'text-am-surface-600'}`}>
                      {windowStatus.message}
                    </p>
                  </div>

                  <StartCallButton 
                    doctorId={appointment.doctor_id}
                    patientId={appointment.patient_id ?? ''}
                    appointmentId={appointment.id}
                    patientName={patientName}
                    disabled={!windowStatus.isOpen} 
                  />

                  {isGuest && (
                    <div className="rounded-2xl bg-white border border-am-doctor-100 p-4 shadow-am-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <UserPlus className="h-3.5 w-3.5 text-am-doctor-600" />
                        <p className="text-xs font-bold text-am-doctor-700 uppercase tracking-wider">Acceso para Invitado</p>
                      </div>
                      <p className="text-xs text-am-surface-500 leading-relaxed mb-4">
                        El paciente no tiene cuenta. Compartí el enlace seguro para que pueda unirse desde su navegador.
                      </p>
                      <button 
                        onClick={() => setShowShareModal(true)}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-white border border-am-doctor-200 py-2.5 text-xs font-bold text-am-doctor-700 hover:bg-am-doctor-50 transition-colors shadow-am-xs active:scale-[0.98]"
                      >
                        <Send className="h-3.5 w-3.5" />
                        COMPARTIR LINK SEGURO
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section>
              <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-am-surface-400">Acciones rápidas</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button 
                  onClick={() => onStatusChange('confirmed')}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-am-surface-200 bg-white px-3 py-3 text-xs font-bold text-am-surface-700 hover:bg-am-surface-50 transition-all shadow-am-sm"
                >
                  Confirmar
                </button>
                <button 
                  onClick={() => onStatusChange('completed')}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-am-surface-200 bg-white px-3 py-3 text-xs font-bold text-am-surface-700 hover:bg-am-surface-50 transition-all shadow-am-sm"
                >
                  Finalizada
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {showShareModal && (
        <ShareGuestLinkModal 
          appointmentId={appointment.id} 
          patientName={patientName}
          onClose={() => setShowShareModal(false)} 
        />
      )}
    </div>
  )
}

function ShareGuestLinkModal({ appointmentId, patientName, onClose }: { appointmentId: string; patientName: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchApi<{ guestLink: string }>(`/api/doctors/appointments/${appointmentId}/guest-link`, { method: 'POST' })
      .then(res => {
        setLink(res.guestLink)
        setLoading(false)
      })
      .catch(() => {
        setError('No pudimos generar el enlace de invitado. Intentá de nuevo.')
        setLoading(false)
      })
  }, [appointmentId])

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const shareWhatsApp = () => {
    const message = `Hola ${patientName}, te comparto el link seguro para nuestra videoconsulta en AutaMedica: ${link}`
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-stone-950/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-am-overlay animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-am-surface-900">Compartir acceso</h3>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-am-surface-50 text-am-surface-400 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 text-am-doctor-600 animate-spin mb-4" />
            <p className="text-sm font-bold text-am-surface-400 uppercase tracking-widest text-center px-8">
              Generando enlace seguro...
            </p>
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-full bg-red-50 flex items-center justify-center text-red-500 mb-4">
              <AlertCircle className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="mt-4 text-xs font-bold text-red-600 underline uppercase tracking-widest"
            >
              Reintentar
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-am-surface-500 leading-relaxed font-medium">
              El paciente podrá unirse a la consulta directamente tocando este link desde su celular o computadora.
            </p>

            <div className="relative group">
              <input 
                readOnly 
                value={link} 
                className="w-full rounded-2xl border border-am-surface-200 bg-am-surface-50 py-3 pl-4 pr-12 text-sm font-mono text-am-surface-600 outline-none"
              />
              <button 
                onClick={copyToClipboard}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-xl bg-white border border-am-surface-200 text-am-surface-500 hover:text-am-doctor-600 hover:border-am-doctor-200 transition-all shadow-am-xs"
              >
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <div className="grid gap-3">
              <button 
                onClick={shareWhatsApp}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-4 text-sm font-bold text-white shadow-am-sm hover:bg-emerald-700 transition-all active:scale-[0.98]"
              >
                <Send className="h-4 w-4" />
                ENVIAR POR WHATSAPP
              </button>
              <p className="text-[10px] text-center text-am-surface-400 font-bold uppercase tracking-widest">
                Válido por 24 horas
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MapPin(props: { className?: string }) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  )
}
