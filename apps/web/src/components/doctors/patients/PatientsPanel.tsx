

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
import { useRealPatients } from '@/hooks/doctors/useRealPatients'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'
import { useStartCall } from '@/hooks/doctors/useStartCall'
import { selectDoctorPatientAppointmentInsights } from '@/lib/doctors/queries/doctor-appointments.selectors'
import { Calendar, Clock, Video, Phone, Users, FileText, RefreshCw, Search, UserCheck, UserPlus } from 'lucide-react'
import { useState, useMemo } from 'react'
import { getDisplayName, getInitials, getAvatarColor } from '@/lib/doctors/lib/utils'

interface PatientsPanelProps {
  doctorUserId?: string
  onSelectPatient?: (patientId: string, tab?: PatientWorkspaceTab) => void
}

type PatientWorkspaceTab = 'patient-info' | 'medical-history'

function PatientCardActions({
  doctorId,
  patientId,
  patientName,
  patientPhone,
  appointmentId,
  onSelectPatient,
}: {
  doctorId: string
  patientId: string
  patientName: string
  patientPhone?: string | null
  appointmentId?: string
  onSelectPatient?: (patientId: string, tab?: PatientWorkspaceTab) => void
}) {
  const { startCall, isStarting, error } = useStartCall({
    doctorId,
    patientId,
    ...(appointmentId ? { appointmentId } : {}),
  })

  return (
    <>
      <div className="flex border-t border-muted/50">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            void startCall()
          }}
          disabled={isStarting}
          className="au-focus-ring flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-green-600 transition-colors hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Video className="h-3.5 w-3.5" />
          {isStarting ? 'Llamando...' : 'Iniciar'}
        </button>
        <div className="w-px bg-muted/50" />
        <a
          href={patientPhone ? `tel:${patientPhone}` : undefined}
          onClick={(event) => {
            event.stopPropagation()
            if (!patientPhone) {
              alert('Este paciente no tiene un teléfono registrado.')
              event.preventDefault()
            }
          }}
          className="au-focus-ring flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50"
        >
          <Phone className="h-3.5 w-3.5" />
          Llamar
        </a>
        <div className="w-px bg-muted/50" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onSelectPatient?.(patientId, 'medical-history')
          }}
          className="au-focus-ring flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary"
        >
          <FileText className="h-3.5 w-3.5" />
          Historial
        </button>
        <div className="w-px bg-muted/50" />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onSelectPatient?.(patientId, 'patient-info')
          }}
          className="au-focus-ring flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-blue-50 hover:text-blue-600"
        >
          <Calendar className="h-3.5 w-3.5" />
          Ficha
        </button>
      </div>
      {error && (
        <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-[11px] text-red-700">
          No pudimos iniciar la llamada con {patientName}. Reintentá desde la agenda o la ficha del paciente.
        </div>
      )}
    </>
  )
}

export function PatientsPanel({ doctorUserId, onSelectPatient }: PatientsPanelProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const { user } = useAuthenticatedUser()

  const { patients, loading, error, refetch } = useRealPatients()
  
  const { appointments } = useDoctorAppointments()
  const resolvedDoctorUserId = doctorUserId ?? user?.doctorProfileId ?? user?.id ?? ''
  const appointmentInsights = useMemo(
    () => selectDoctorPatientAppointmentInsights(appointments),
    [appointments],
  )
  const upcomingAppointmentsCount = appointmentInsights.upcomingAppointmentsCount
  const nextAppointmentByPatient = appointmentInsights.nextAppointmentByPatient
  const completedByPatient = appointmentInsights.completedByPatient

  const patientsWithHistoryCount = useMemo(() => {
    return patients.filter(p => p.profile?.first_name && p.profile?.last_name).length
  }, [patients])

  const filteredPatients = useMemo(() => {
    let result = patients
    if (searchTerm) {
      const s = searchTerm.toLowerCase()
      result = result.filter((p) => {
        const pName = `${p.profile?.first_name ?? ''} ${p.profile?.last_name ?? ''}`.toLowerCase()
        const pEmail = p.profile?.email?.toLowerCase() ?? ''
        return pName.includes(s) || pEmail.includes(s)
      })
    }

    return [...result].sort((a, b) => {
      const nextA = nextAppointmentByPatient.get(a.id)
      const nextB = nextAppointmentByPatient.get(b.id)

      if (nextA && nextB) {
        return new Date(nextA.start_time).getTime() - new Date(nextB.start_time).getTime()
      }
      if (nextA) return -1
      if (nextB) return 1

      const compA = completedByPatient.get(a.id) ?? 0
      const compB = completedByPatient.get(b.id) ?? 0
      if (compA !== compB) {
        return compB - compA
      }

      const hasNameA = !!(a.profile?.first_name || a.profile?.last_name)
      const hasNameB = !!(b.profile?.first_name || b.profile?.last_name)
      if (hasNameA && !hasNameB) return -1
      if (!hasNameA && hasNameB) return 1

      const nameA = `${a.profile?.first_name ?? ''} ${a.profile?.last_name ?? ''}`.trim() || a.profile?.email || ''
      const nameB = `${b.profile?.first_name ?? ''} ${b.profile?.last_name ?? ''}`.trim() || b.profile?.email || ''
      return nameA.localeCompare(nameB)
    })
  }, [patients, searchTerm, nextAppointmentByPatient, completedByPatient])

  const translateGender = (gender: string) => {
    const g = gender.toLowerCase()
    if (g === 'male' || g === 'm') return 'Masculino'
    if (g === 'female' || g === 'f') return 'Femenino'
    if (g === 'other') return 'Otro'
    return gender
  }

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
            <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
            <p className="text-sm text-muted-foreground">{patients.length} pacientes asignados</p>
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
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold">{patients.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200/50 bg-emerald-50/50 px-4 py-3">
          <UserCheck className="h-5 w-5 text-emerald-600" />
          <div>
            <p className="text-xs text-muted-foreground">Datos completos</p>
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
                onClick={() => onSelectPatient?.(patient.id, 'patient-info')}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectPatient?.(patient.id, 'patient-info') }}
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
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">{translateGender(patient.gender)}</Badge>
                        )}
                        {patient.birth_date && (
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(patient.birth_date).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
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

                  <PatientCardActions
                    doctorId={resolvedDoctorUserId}
                    patientId={patient.id}
                    patientName={name}
                    patientPhone={patient.profile?.phone}
                    appointmentId={nextAppt?.id}
                    onSelectPatient={onSelectPatient}
                  />
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
