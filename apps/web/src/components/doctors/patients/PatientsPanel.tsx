/**
 * Panel de gestión de pacientes para el portal de doctores.
 * Arquitectura: UI Layer.
 * Consume hooks de la capa Hook/Controller.
 */
'use client'

import { Badge } from '@/components/ui/Badge'
import { Card, CardContent } from '@/components/ui/Card'
import { ErrorState } from '@/components/ui/ErrorState'
import { Input } from '@/components/ui/Input'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'
import { useDoctorPatients } from '@/hooks/doctors/useRealPatients'
import { Calendar, Clock, FileText, Phone, RefreshCw, Search, UserCheck, UserPlus, Users, Video } from 'lucide-react'
import { useMemo, useState } from 'react'

export interface PatientsPanelProps {
  doctorUserId?: string
  onSelectPatient?: (patientId: string) => void
}

function getInitials(firstName?: string | null, lastName?: string | null): string {
  const f = firstName?.[0]?.toUpperCase() ?? ''
  const l = lastName?.[0]?.toUpperCase() ?? ''
  return (f + l) || '?'
}

function getDisplayName(profile?: { first_name?: string | null; last_name?: string | null; email?: string | null }): { name: string; isEmail: boolean } {
  const first = profile?.first_name?.trim()
  const last = profile?.last_name?.trim()
  if (first || last) return { name: [first, last].filter(Boolean).join(' '), isEmail: false }
  if (profile?.email) return { name: profile.email, isEmail: true }
  return { name: 'Paciente sin datos', isEmail: true }
}

const AVATAR_COLORS = [
  'bg-sky-100 text-sky-700 border-sky-200',
  'bg-emerald-100 text-emerald-700 border-emerald-200',
  'bg-violet-100 text-violet-700 border-violet-200',
  'bg-amber-100 text-amber-700 border-amber-200',
  'bg-rose-100 text-rose-700 border-rose-200',
  'bg-cyan-100 text-cyan-700 border-cyan-200',
]

function getAvatarColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function PatientsPanel({ doctorUserId, onSelectPatient }: PatientsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const { patients, loading, error, refetch } = useDoctorPatients(doctorUserId ?? '')

  const { user } = useAuthenticatedUser()
  const { appointments } = useDoctorAppointments(user?.doctorProfileId)

  const upcomingAppointmentsCount = useMemo(() => {
    const now = Date.now()
    return appointments.filter(a =>
      (a.status === 'scheduled' || a.status === 'confirmed') &&
      Date.parse(a.start_time) > now
    ).length
  }, [appointments])

  // Map patient_id → next appointment for that patient
  const nextAppointmentByPatient = useMemo(() => {
    const now = Date.now()
    const map = new Map<string, { start_time: string; type: string | null }>()
    const future = appointments
      .filter(a => (a.status === 'scheduled' || a.status === 'confirmed') && Date.parse(a.start_time) > now)
      .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
    for (const a of future) {
      if (a.patient_id && !map.has(a.patient_id)) {
        map.set(a.patient_id, { start_time: a.start_time, type: a.type })
      }
    }
    return map
  }, [appointments])

  // Count completed appointments per patient
  const completedByPatient = useMemo(() => {
    const map = new Map<string, number>()
    for (const a of appointments) {
      if (a.status === 'completed' && a.patient_id) {
        map.set(a.patient_id, (map.get(a.patient_id) ?? 0) + 1)
      }
    }
    return map
  }, [appointments])

  const patientsWithHistoryCount = useMemo(() => {
    return patients.filter(p => p.profile?.first_name && p.profile?.last_name).length
  }, [patients])

  const filteredPatients = useMemo(() => {
    if (!searchTerm) return patients
    const s = searchTerm.toLowerCase()
    return patients.filter((p) => {
      const pName = `${p.profile?.first_name ?? ''} ${p.profile?.last_name ?? ''}`.toLowerCase()
      const pEmail = p.profile?.email?.toLowerCase() ?? ''
      return pName.includes(s) || pEmail.includes(s)
    })
  }, [patients, searchTerm])

  if (loading && patients.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardContent className="p-5">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2 rounded" />
                    <Skeleton className="h-3 w-2/3 rounded" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  if (error && patients.length === 0) {
    return (
      <ErrorState
        title="Error al cargar pacientes"
        message={error}
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mis Pacientes</h1>
            <p className="text-sm text-muted-foreground">{patients.length} asignados</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 self-start rounded-lg border border-muted px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all active:scale-95"
        >
          <RefreshCw className="h-4 w-4" />
          Sincronizar
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-3 grid-cols-3">
        <div className="flex items-center gap-3 rounded-xl border border-primary/10 bg-primary/5 px-4 py-3">
          <Users className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Propios</p>
            <p className="text-lg font-bold">{patients.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200/50 bg-emerald-50/50 px-4 py-3">
          <UserCheck className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-xs text-muted-foreground">Con HC</p>
            <p className="text-lg font-bold">{patientsWithHistoryCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-blue-200/50 bg-blue-50/50 px-4 py-3">
          <UserPlus className="h-5 w-5 text-blue-600" />
          <div>
            <p className="text-xs text-muted-foreground">Turnos</p>
            <p className="text-lg font-bold">{upcomingAppointmentsCount}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o email..."
          className="pl-9"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Patient Cards */}
      {filteredPatients.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-muted py-16">
          <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">
            {searchTerm ? 'No hay coincidencias.' : 'Sin pacientes asignados.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPatients.map((patient) => {
            const { name, isEmail } = getDisplayName(patient.profile)
            const initials = getInitials(patient.profile?.first_name, patient.profile?.last_name)
            const avatarColor = getAvatarColor(patient.id)
            const nextAppt = nextAppointmentByPatient.get(patient.id)
            const completedCount = completedByPatient.get(patient.id) ?? 0

            return (
              <div
                key={patient.id}
                role="button"
                tabIndex={0}
                className="group cursor-pointer"
                onClick={() => onSelectPatient?.(patient.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectPatient?.(patient.id) }}
              >
              <Card className="overflow-hidden transition-all duration-200 group-hover:shadow-md group-hover:-translate-y-0.5 group-hover:border-primary/30">
                <CardContent className="p-0">
                  {/* Patient identity */}
                  <div className="flex items-center gap-3 px-5 pt-5 pb-3">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border font-bold text-sm ${avatarColor}`}>
                      {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`font-semibold truncate group-hover:text-primary transition-colors ${isEmail ? 'text-muted-foreground text-sm' : 'text-foreground'}`}>
                        {name}
                      </p>
                      {!isEmail && patient.profile?.email && (
                        <p className="text-xs text-muted-foreground truncate">{patient.profile.email}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        {patient.gender && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{patient.gender}</Badge>
                        )}
                        {patient.date_of_birth && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(patient.date_of_birth).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Context info */}
                  <div className="border-t border-muted/50 bg-muted/20 px-5 py-3 space-y-1.5">
                    {nextAppt ? (
                      <div className="flex items-center gap-2 text-xs">
                        {nextAppt.type === 'telemedicine' ? (
                          <Video className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <Calendar className="h-3.5 w-3.5 text-blue-600" />
                        )}
                        <span className="text-muted-foreground">Proximo turno:</span>
                        <span className="font-medium text-foreground">
                          {new Date(nextAppt.start_time).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}{' '}
                          {new Date(nextAppt.start_time).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Sin turnos programados</span>
                      </div>
                    )}
                    {completedCount > 0 && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <FileText className="h-3.5 w-3.5" />
                        <span>{completedCount} consulta{completedCount !== 1 ? 's' : ''} realizada{completedCount !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex border-t border-muted/50">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelectPatient?.(patient.id) }}
                      className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      Historial
                    </button>
                    <div className="w-px bg-muted/50" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelectPatient?.(patient.id) }}
                      className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-green-600 hover:bg-green-50 transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      Llamar
                    </button>
                    <div className="w-px bg-muted/50" />
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelectPatient?.(patient.id) }}
                      className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      Turno
                    </button>
                  </div>
                </CardContent>
              </Card>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
