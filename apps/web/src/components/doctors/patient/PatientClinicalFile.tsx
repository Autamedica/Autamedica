'use client'

import type { JSX } from 'react'
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Mail,
  Pill,
  Phone,
  ShieldAlert,
  User,
  Video,
} from 'lucide-react'
import { usePatientData } from '@/hooks/doctors/usePatientData'
import { usePatientClinicalFile } from '@/hooks/doctors/usePatientClinicalFile'
import { useStartCall } from '@/hooks/doctors/useStartCall'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import type { UUID } from '@autamedica/types'
import type { TriageSnapshot, AnamnesisFileSummary } from '@/hooks/doctors/usePatientClinicalFile'
import type { DoctorAppointmentRecord } from '@/lib/doctors/types/appointments'

// ── Utilities ──────────────────────────────────────────────────────────────

function calcAge(dob: string | null | undefined): string {
  if (!dob) return '—'
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return `${age} años`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Sub-components ──────────────────────────────────────────────────────────

const TRIAGE_CONFIG = {
  urgent:   { label: 'Urgente',   ring: 'ring-red-500',    bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500 animate-pulse' },
  priority: { label: 'Prioritario', ring: 'ring-amber-400', bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  routine:  { label: 'Rutina',    ring: 'ring-emerald-400', bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
}

function TriageCard({ triage }: { triage: TriageSnapshot }): JSX.Element {
  const cfg = TRIAGE_CONFIG[triage.priority]
  return (
    <div className={`rounded-2xl border-2 p-4 ${cfg.ring} ${cfg.bg}`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className={`h-4 w-4 ${cfg.text}`} />
          <span className={`text-xs font-bold uppercase tracking-wider ${cfg.text}`}>Triage Clínico</span>
        </div>
        <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${cfg.bg} ${cfg.text} ring-1 ${cfg.ring}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>
      <p className={`text-sm font-semibold ${cfg.text} mb-3`}>{triage.mandate}</p>
      {triage.medicationName && (
        <div className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2">
          <Pill className="h-4 w-4 text-am-surface-500 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-am-surface-800 truncate">{triage.medicationName}</p>
            <p className="text-[10px] text-am-surface-500">
              {triage.medicationDose ?? 'Dosis no registrada'}
              {triage.daysRemaining !== null && ` · ${triage.daysRemaining} días restantes`}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function AnamnesisCard({ anamnesis, patientId }: { anamnesis: AnamnesisFileSummary; patientId: string }): JSX.Element {
  const statusBadge =
    anamnesis.status === 'completed' || anamnesis.status === 'approved'
      ? <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700"><CheckCircle className="h-3 w-3" /> Completa</span>
      : <span className="text-[10px] font-semibold text-amber-600">{anamnesis.completionPct}% completada</span>

  return (
    <div className="rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-am-doctor-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-am-surface-500">Anamnesis</span>
        </div>
        <div className="flex items-center gap-2">
          {statusBadge}
          <a
            href={`/api/doctors/patients/${patientId}/anamnesis?format=html`}
            target="_blank"
            rel="noreferrer"
            className="text-[10px] font-medium text-am-doctor-600 hover:underline"
          >
            Ver completa
          </a>
        </div>
      </div>

      {anamnesis.chiefComplaint && (
        <p className="mb-3 text-sm text-am-surface-700 leading-relaxed">{anamnesis.chiefComplaint}</p>
      )}

      <div className="grid grid-cols-3 gap-2">
        <MiniList label="Medicamentos" items={anamnesis.medications} emptyText="Sin registro" color="text-blue-600" />
        <MiniList label="Diagnósticos" items={anamnesis.diagnoses} emptyText="Sin registro" color="text-purple-600" />
        <MiniList label="Alergias" items={anamnesis.allergies} emptyText="Sin registro" color="text-red-600" />
      </div>

      {anamnesis.updatedAt && (
        <p className="mt-3 text-[10px] text-am-surface-400">Última actualización: {formatDate(anamnesis.updatedAt)}</p>
      )}
    </div>
  )
}

function MiniList({ label, items, emptyText, color }: { label: string; items: string[]; emptyText: string; color: string }): JSX.Element {
  return (
    <div>
      <p className={`mb-1 text-[10px] font-bold uppercase tracking-wider ${color}`}>{label}</p>
      {items.length > 0 ? (
        <ul className="space-y-0.5">
          {items.slice(0, 3).map((item, i) => (
            <li key={i} className="flex items-start gap-1 text-[11px] text-am-surface-700">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-am-surface-400" />
              <span className="truncate">{item}</span>
            </li>
          ))}
          {items.length > 3 && <li className="text-[10px] text-am-surface-400">+{items.length - 3} más</li>}
        </ul>
      ) : (
        <p className="text-[11px] text-am-surface-400">{emptyText}</p>
      )}
    </div>
  )
}

function AppointmentsTimeline({ appointments, patientId }: { appointments: DoctorAppointmentRecord[]; patientId: string }): JSX.Element {
  const relevant = appointments
    .filter(a => a.patient_id === patientId)
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    .slice(0, 5)

  if (relevant.length === 0) {
    return (
      <div className="rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm">
        <div className="mb-2 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-am-doctor-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-am-surface-500">Turnos</span>
        </div>
        <p className="text-sm text-am-surface-400">Sin turnos registrados con este médico.</p>
      </div>
    )
  }

  const STATUS_STYLE: Record<string, string> = {
    completed:  'bg-emerald-50 text-emerald-700',
    scheduled:  'bg-blue-50 text-blue-700',
    pending:    'bg-amber-50 text-amber-700',
    cancelled:  'bg-red-50 text-red-700',
    in_progress:'bg-am-doctor-50 text-am-doctor-700',
  }

  const STATUS_LABEL: Record<string, string> = {
    completed:  'Realizada',
    scheduled:  'Programada',
    pending:    'Pendiente',
    cancelled:  'Cancelada',
    in_progress:'En curso',
  }

  return (
    <div className="rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm">
      <div className="mb-3 flex items-center gap-2">
        <Calendar className="h-4 w-4 text-am-doctor-600" />
        <span className="text-xs font-bold uppercase tracking-wider text-am-surface-500">Turnos</span>
      </div>
      <ul className="space-y-2">
        {relevant.map(appt => {
          const isUpcoming = new Date(appt.start_time) > new Date()
          const statusStyle = STATUS_STYLE[appt.status] ?? 'bg-am-surface-100 text-am-surface-600'
          const statusLabel = STATUS_LABEL[appt.status] ?? appt.status
          return (
            <li key={appt.id} className="flex items-center gap-3 rounded-xl bg-am-surface-50 px-3 py-2">
              {appt.type === 'telemedicine'
                ? <Video className="h-3.5 w-3.5 shrink-0 text-am-doctor-500" />
                : <Clock className="h-3.5 w-3.5 shrink-0 text-am-surface-400" />
              }
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-semibold ${isUpcoming ? 'text-am-surface-900' : 'text-am-surface-500'}`}>
                  {formatDate(appt.start_time)}
                </p>
                <p className="text-[10px] text-am-surface-400 capitalize">{appt.type.replace('_', ' ')}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusStyle}`}>{statusLabel}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

interface PatientClinicalFileProps {
  patientId: UUID | null
  onSchedule?: () => void
}

export function PatientClinicalFile({ patientId, onSchedule }: PatientClinicalFileProps): JSX.Element {
  const { patient, loading: patientLoading } = usePatientData(patientId)
  const { anamnesis, triage, anamnesisError, loading: clinicalLoading } = usePatientClinicalFile(patientId)
  const { appointments } = useDoctorAppointments()
  const { user } = useAuthenticatedUser()

  const resolvedDoctorId = user?.doctorProfileId ?? user?.id ?? ''
  const { startCall, isStarting } = useStartCall({
    doctorId: resolvedDoctorId,
    patientId: patientId ?? '',
  })

  const loading = patientLoading || clinicalLoading

  if (!patientId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <User className="mx-auto mb-4 h-12 w-12 text-am-surface-300" />
          <p className="text-am-surface-500">Seleccioná un paciente para ver su ficha clínica.</p>
        </div>
      </div>
    )
  }

  if (loading && !patient) {
    return (
      <div className="flex h-full items-center justify-center">
        <Activity className="h-6 w-6 animate-spin text-am-doctor-500" />
      </div>
    )
  }

  // Derived patient fields — typed loosely since PatientInfoTab uses the same cast pattern
  const p = patient as unknown as Record<string, unknown>
  const firstName = (p?.first_name ?? '') as string
  const lastName = (p?.last_name ?? '') as string
  const fullName = ((p?.full_name as string) || `${firstName} ${lastName}`.trim()) || 'Paciente'
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.trim().toUpperCase() || 'P'
  const gender = (p?.gender as string | null) ?? null
  const genderLabel = gender === 'male' ? 'Masculino' : gender === 'female' ? 'Femenino' : gender ?? null
  const email = (p?.email as string | null) ?? null
  const phone = (p?.phone as string | null) ?? null
  const dob = (p?.birth_date as string | null) ?? (p?.date_of_birth as string | null) ?? null
  const isActive = p?.active !== false

  return (
    <div className="h-full overflow-y-auto bg-am-surface-50 p-4 md:p-6">
      <div className="mx-auto max-w-4xl space-y-4">

        {/* Header */}
        <div className="rounded-2xl border border-am-surface-200 bg-white p-5 shadow-am-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-am-doctor-500 to-am-primary-600 text-lg font-bold text-white shadow-md shadow-am-doctor-500/20">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-am-surface-900">{fullName}</h1>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-am-surface-100 text-am-surface-500'}`}>
                  {isActive ? 'Activo' : 'Inactivo'}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-am-surface-500">
                {genderLabel && <span>{genderLabel}</span>}
                {dob && <><span>·</span><span>{calcAge(dob)}</span></>}
                {email && (
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {email}
                  </span>
                )}
                {phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {phone}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void startCall()}
                disabled={isStarting || !resolvedDoctorId}
                className="flex items-center gap-1.5 rounded-xl bg-am-doctor-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-am-doctor-700 active:scale-95 disabled:opacity-50"
              >
                <Video className="h-4 w-4" />
                {isStarting ? 'Conectando...' : 'Teleconsulta'}
              </button>
              {onSchedule && (
                <button
                  type="button"
                  onClick={onSchedule}
                  className="flex items-center gap-1.5 rounded-xl border border-am-surface-200 bg-white px-4 py-2 text-sm font-medium text-am-surface-700 transition-all hover:border-am-doctor-300 hover:text-am-surface-900 active:scale-95"
                >
                  <Calendar className="h-4 w-4" />
                  Agendar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Triage (if exists) */}
        {triage && <TriageCard triage={triage} />}

        {/* Anamnesis */}
        {anamnesisError ? (
          <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {anamnesisError}
          </div>
        ) : anamnesis ? (
          <AnamnesisCard anamnesis={anamnesis} patientId={patientId} />
        ) : (
          !clinicalLoading && (
            <div className="rounded-2xl border border-dashed border-am-surface-200 p-4 text-center text-sm text-am-surface-400">
              El paciente no tiene anamnesis registrada aún.
            </div>
          )
        )}

        {/* Appointments */}
        <AppointmentsTimeline appointments={appointments} patientId={patientId} />

      </div>
    </div>
  )
}
