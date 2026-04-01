'use client'

import { Calendar, Clock, Users, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useDoctorStats } from '@/hooks/doctors/useDoctorStats'
import { getCallWindowStatus } from '@/lib/calls/lib/call-error-messages'
import { resolvePatientNameMap } from '@/lib/doctors/services/appointment.service'
import { StartCallButton } from '@/components/doctors/calls/StartCallButton'
import type { Appointment } from '@autamedica/types'

const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consulta',
  follow_up: 'Seguimiento',
  emergency: 'Emergencia',
  telemedicine: 'Videoconsulta',
  lab_test: 'Laboratorio',
  checkup: 'Control',
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos dias'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '--:--'
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Buenos_Aires',
  }).format(d)
}

function isSameDay(iso: string, ref: Date): boolean {
  const d = new Date(iso)
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  )
}

interface DoctorDailySummaryProps {
  onActivateCamera: () => void
  isBlocked?: boolean
}

export function DoctorDailySummary({ onActivateCamera, isBlocked }: DoctorDailySummaryProps) {
  const { user } = useAuthenticatedUser()
  const { appointments, loading: apptLoading } = useDoctorAppointments(user?.doctorProfileId)
  const { stats, loading: statsLoading } = useDoctorStats(user?.doctorProfileId)
  const [patientNames, setPatientNames] = useState<Record<string, string>>({})

  const now = useMemo(() => new Date(), [])

  const todayAppointments = useMemo(() => {
    if (!appointments.length) return []
    return appointments
      .filter((a) => isSameDay(a.start_time, now) && a.status !== 'cancelled')
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
  }, [appointments, now])

  const upcomingToday = useMemo(() => {
    const nowMs = now.getTime()
    return todayAppointments
      .filter((a) => new Date(a.start_time).getTime() >= nowMs - 2 * 60 * 60 * 1000)
      .slice(0, 3)
  }, [todayAppointments, now])

  // Resolve patient names in batch
  useEffect(() => {
    const ids = Array.from(
      new Set(
        todayAppointments
          .map((a) => a.patient_id)
          .filter(Boolean)
      )
    )
    if (ids.length === 0) return

    void resolvePatientNameMap(ids).then(setPatientNames)
  }, [todayAppointments])

  const weekCount = useMemo(() => {
    if (!appointments.length) return 0
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay())
    startOfWeek.setHours(0, 0, 0, 0)
    const endOfWeek = new Date(startOfWeek)
    endOfWeek.setDate(startOfWeek.getDate() + 7)
    return appointments.filter((a) => {
      const t = new Date(a.start_time).getTime()
      return t >= startOfWeek.getTime() && t < endOfWeek.getTime() && a.status !== 'cancelled'
    }).length
  }, [appointments, now])

  const firstName = user?.profile?.firstName ?? user?.profile?.fullName?.split(' ')[0] ?? 'Doctor'
  const loading = apptLoading || statsLoading

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-gradient-to-b from-slate-50 to-white px-4 py-8 sm:px-8">
      {/* Greeting */}
      <div className="w-full max-w-lg text-center">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          {getGreeting()}, {firstName}
        </h2>
        <p className="mt-1 text-sm text-slate-500">Tu agenda de hoy</p>
      </div>

      {/* Stats row */}
      <div className="grid w-full max-w-lg grid-cols-3 gap-3">
        <StatCard
          icon={<Calendar className="h-4 w-4 text-sky-600" />}
          label="Hoy"
          value={loading ? '...' : String(stats?.todayCount ?? todayAppointments.length)}
        />
        <StatCard
          icon={<Clock className="h-4 w-4 text-violet-600" />}
          label="Semana"
          value={loading ? '...' : String(weekCount)}
        />
        <StatCard
          icon={<Users className="h-4 w-4 text-emerald-600" />}
          label="Pacientes"
          value={loading ? '...' : String(stats?.patientsCount ?? 0)}
        />
      </div>

      {/* Upcoming appointments */}
      <div className="w-full max-w-lg">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Proximas consultas</h3>

        {loading ? (
          <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
          </div>
        ) : upcomingToday.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-8 text-center">
            <p className="text-sm text-slate-500">Sin mas consultas hoy</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {upcomingToday.map((appt, idx) => (
              <AppointmentRow
                key={appt.id}
                appointment={appt}
                patientName={appt.patient_id ? (patientNames[appt.patient_id] ?? 'Paciente') : 'Sin paciente'}
                isFirst={idx === 0}
                doctorId={user?.doctorProfileId ?? ''}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex w-full max-w-lg flex-col items-center gap-3">
        <a
          href="/doctors/appointments"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-sky-600 transition-colors hover:text-sky-700"
        >
          Ver agenda completa
          <ChevronRight className="h-4 w-4" />
        </a>
        <button
          type="button"
          onClick={onActivateCamera}
          disabled={isBlocked}
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
        >
          Probar camara sin transmitir
        </button>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-4 shadow-sm">
      {icon}
      <span className="text-xl font-bold text-slate-900">{value}</span>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  )
}

function AppointmentRow({
  appointment,
  patientName,
  isFirst,
  doctorId,
}: {
  appointment: Appointment
  patientName: string
  isFirst: boolean
  doctorId: string
}) {
  const windowStatus = getCallWindowStatus(appointment)
  const isTelemedicine = appointment.type === 'telemedicine'
  const typeLabel = APPOINTMENT_TYPE_LABELS[appointment.type ?? ''] ?? 'Consulta'

  const opensInLabel = useMemo(() => {
    if (windowStatus.isOpen) return null
    if (windowStatus.opensInMs === null) return null
    const mins = Math.ceil(windowStatus.opensInMs / 60_000)
    if (mins <= 0) return null
    if (mins < 60) return `Entrar en ${mins} min`
    const hours = Math.floor(mins / 60)
    const remainMins = mins % 60
    return `Entrar en ${hours}h ${remainMins > 0 ? `${remainMins}m` : ''}`
  }, [windowStatus])

  return (
    <div
      className={`au-interactive flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 ${
        isFirst && windowStatus.isOpen ? 'bg-sky-50/50' : ''
      }`}
    >
      {/* Time + status dot */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-bold text-slate-900">{formatTime(appointment.start_time)}</span>
        <span
          className={`h-2.5 w-2.5 rounded-full ${
            windowStatus.isOpen
              ? 'bg-emerald-500 shadow-sm shadow-emerald-500/40'
              : 'border-2 border-slate-300 bg-white'
          }`}
        />
      </div>

      {/* Patient info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{patientName}</p>
        <p className="mt-0.5 text-xs text-slate-500">
          {typeLabel}
          {isTelemedicine && !windowStatus.isOpen && opensInLabel && (
            <span className="ml-1.5 text-sky-600">&middot; {opensInLabel}</span>
          )}
          {windowStatus.isOpen && isTelemedicine && (
            <span className="ml-1.5 text-emerald-600">&middot; Disponible ahora</span>
          )}
          {!windowStatus.isOpen && !opensInLabel && windowStatus.message && (
            <span className="ml-1.5 text-slate-400">&middot; {windowStatus.message}</span>
          )}
        </p>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        {isTelemedicine && windowStatus.isOpen && appointment.patient_id && (
          <StartCallButton
            doctorId={doctorId}
            patientId={appointment.patient_id}
            patientName={patientName}
            appointmentId={appointment.id}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-600 active:scale-95"
          />
        )}
      </div>
    </div>
  )
}
