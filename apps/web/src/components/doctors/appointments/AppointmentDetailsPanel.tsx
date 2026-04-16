'use client'

import { 
  Calendar, Clock, Video, User, 
  FileText, Trash2, Edit3, CheckCircle2, 
  XCircle, AlertCircle, UserPlus, Send,
  Activity, MapPin, type LucideIcon
} from 'lucide-react'
import type { Appointment, AppointmentStatus } from '@autamedica/types'
import { getCallWindowStatus } from '@/lib/calls/lib/call-error-messages'
import { StartCallButton } from '../calls/StartCallButton'

interface AppointmentDetailsPanelProps {
  appointment: Appointment
  patientName: string
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
  const status = STATUS_CONFIG[appointment.status ?? 'scheduled'] ?? STATUS_CONFIG.scheduled
  const start = new Date(appointment.start_time)
  const timeStr = start.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
  const dateStr = start.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  
  const windowStatus = getCallWindowStatus(appointment)
  const isTelemedicine = appointment.type === 'telemedicine'
  const isGuest = !appointment.patient_id && appointment.notes?.includes('[INVITADO:')

  return (
    <div className="flex h-full flex-col bg-white animate-in fade-in duration-300">
      {/* Header */}
      <header className="border-b border-am-surface-100 bg-am-surface-50/30 px-8 py-8">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${status.bg} ${status.color}`}>
                {status.label}
              </div>
              {isGuest && (
                <div className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest bg-sky-100 text-sky-700 border border-sky-200">
                  Invitado Externo
                </div>
              )}
            </div>
            <h2 className="mt-4 truncate text-3xl font-bold tracking-tight text-am-surface-900 capitalize">
              {patientName}
            </h2>
            <div className="mt-2 flex items-center gap-4 text-am-surface-500">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Calendar className="h-4 w-4" />
                {dateStr}
              </div>
              <div className="h-1 w-1 rounded-full bg-am-surface-200" />
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <Clock className="h-4 w-4" />
                {timeStr} ({appointment.duration_minutes} min)
              </div>
            </div>
          </div>

          <div className="flex gap-2">
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
      <div className="flex-1 overflow-y-auto p-8 scrollbar-thin">
        <div className="grid gap-8 lg:grid-cols-2">
          {/* Main Info */}
          <div className="space-y-8">
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

          {/* Action Sidebar */}
          <div className="space-y-8">
            {isTelemedicine && (
              <section className="rounded-3xl border border-am-doctor-100 bg-am-doctor-50/50 p-6">
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
                    roomId={appointment.room_id} 
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
                        onClick={() => {
                          // Trigger guest link generation
                          window.alert('Funcionalidad de compartir link directo en desarrollo')
                        }}
                        className="w-full flex items-center justify-center gap-2 rounded-xl bg-white border border-am-doctor-200 py-2.5 text-xs font-bold text-am-doctor-700 hover:bg-am-doctor-50 transition-colors"
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
                  className="flex items-center justify-center gap-2 rounded-2xl border border-am-surface-200 bg-white py-3 text-xs font-bold text-am-surface-700 hover:bg-am-surface-50 transition-all shadow-am-sm"
                >
                  Confirmar
                </button>
                <button 
                  onClick={() => onStatusChange('completed')}
                  className="flex items-center justify-center gap-2 rounded-2xl border border-am-surface-200 bg-white py-3 text-xs font-bold text-am-surface-700 hover:bg-am-surface-50 transition-all shadow-am-sm"
                >
                  Marcar Finalizada
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}


