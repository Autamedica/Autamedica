import type { Appointment } from '@autamedica/types'
"use client"

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import { Calendar, Clock, Video, User, Plus, Filter } from 'lucide-react'
import { useAuthenticatedUser } from '@/hooks/doctors/useAuthenticatedUser'
import { useDoctorAppointments } from '@/hooks/doctors/useDoctorAppointments'
import { resolvePatientNameMap } from '@/lib/doctors/services/appointment.service'
import { getCallWindowStatus } from '@/lib/calls/lib/call-error-messages'
import { selectDoctorAppointmentBoardView } from '@/lib/doctors/queries/doctor-appointments.selectors'
import { StartCallButton } from '../calls/StartCallButton'
import { CreateAppointmentModal } from './CreateAppointmentModal'
import type { DoctorAppointmentFormValues } from '@/lib/doctors/types/appointments'

interface AppointmentsPanelProps {
  doctorId?: string
}

export function AppointmentsPanel({ doctorId }: AppointmentsPanelProps): JSX.Element {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null)
  const [patientNames, setPatientNames] = useState<Record<string, string>>({})
  
  const { user, loading: userLoading } = useAuthenticatedUser()
  const { appointments, loading, error, isClientReady, createAppointment, updateAppointment } = useDoctorAppointments()

  const resolvedDoctorId = doctorId ?? user?.doctorProfileId

  const boardView = useMemo(
    () => selectDoctorAppointmentBoardView(appointments),
    [appointments],
  )
  const sortedAppointments = boardView.sortedAppointments

  const resolveNames = useCallback(async () => {
    if (appointments.length === 0) return
    const patientIds = Array.from(new Set(appointments.map(a => a.patient_id).filter(Boolean)))
    if (patientIds.length === 0) return
    const nameMap = await resolvePatientNameMap(patientIds)
    setPatientNames(nameMap)
  }, [appointments])

  useEffect(() => {
    void resolveNames()
  }, [resolveNames])

  const handleSaveAppointment = useCallback(
    async (values: DoctorAppointmentFormValues) => {
      if (editingAppointment) {
        await updateAppointment(editingAppointment.id, values)
      } else {
        await createAppointment(values)
      }
      setIsCreateModalOpen(false)
      setEditingAppointment(null)
    },
    [createAppointment, updateAppointment, editingAppointment],
  )

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-yellow-50 text-yellow-700'
      case 'confirmed': return 'bg-green-50 text-green-700'
      case 'cancelled': return 'bg-red-50 text-red-700'
      case 'completed': return 'bg-am-primary-50 text-am-primary-700'
      default: return 'bg-am-surface-100 text-am-surface-500'
    }
  }

  const getTypeIcon = (type: string | null) => {
    switch (type) {
      case 'telemedicine': return <Video className="h-4 w-4" />
      case 'consultation': return <User className="h-4 w-4" />
      default: return <Calendar className="h-4 w-4" />
    }
  }

  if ((!doctorId && userLoading) || !isClientReady || loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl border border-am-surface-200 bg-white p-4">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl am-skeleton" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-1/3 rounded-lg am-skeleton" />
                <div className="h-3 w-1/2 rounded-lg am-skeleton" />
              </div>
              <div className="h-6 w-16 rounded-full am-skeleton" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-2">⚠️</div>
          <p className="text-red-600">Error: {error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-am-primary-50 p-2">
            <Calendar className="h-6 w-6 text-am-primary-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-am-surface-900">Agenda de Citas</h1>
            <p className="text-am-surface-500">
              {sortedAppointments.length} cita{sortedAppointments.length !== 1 ? 's' : ''} programada{sortedAppointments.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            className="au-interactive au-focus-ring flex items-center gap-2 rounded-lg bg-white border border-am-surface-300 px-4 py-2 text-sm font-medium text-am-surface-700 shadow-am-sm transition hover:bg-am-surface-100"
          >
            <Filter className="h-4 w-4" />
            Filtrar
          </button>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="au-interactive au-focus-ring flex items-center gap-2 rounded-lg bg-am-primary-600 px-4 py-2 text-sm font-medium text-white shadow-am-sm transition hover:bg-am-primary-700"
          >
            <Plus className="h-4 w-4" />
            Nueva Cita
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-am-primary-50 p-2"><Calendar className="h-5 w-5 text-am-primary-600" /></div>
                <div>
                  <p className="text-sm text-am-surface-500">Hoy</p>
                  <p className="text-xl font-semibold text-am-surface-900">{boardView.todayCount}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-green-50 p-2"><Video className="h-5 w-5 text-green-700" /></div>
                <div>
                  <p className="text-sm text-am-surface-500">Telemedicina</p>
                  <p className="text-xl font-semibold text-am-surface-900">{boardView.telemedicineCount}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-yellow-50 p-2"><Clock className="h-5 w-5 text-yellow-600" /></div>
                <div>
                  <p className="text-sm text-am-surface-500">Pendientes</p>
                  <p className="text-xl font-semibold text-am-surface-900">{boardView.pendingCount}</p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-50 p-2"><User className="h-5 w-5 text-emerald-700" /></div>
                <div>
                  <p className="text-sm text-am-surface-500">Confirmadas</p>
                  <p className="text-xl font-semibold text-am-surface-900">{boardView.confirmedCount}</p>
                </div>
              </div>
            </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {sortedAppointments.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <Calendar className="mx-auto h-12 w-12 text-am-surface-400 mb-4" />
              <h3 className="text-lg font-medium text-am-surface-700 mb-2">No hay citas programadas</h3>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 rounded-lg bg-am-primary-600 px-4 py-2 text-sm font-medium text-white shadow-am-sm transition hover:bg-am-primary-700 mx-auto"
              >
                <Plus className="h-4 w-4" />
                Programar Cita
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto">
            <div className="grid gap-4">
              {sortedAppointments.map((appointment) => (
                <div key={appointment.id} className="au-interactive rounded-2xl border border-am-surface-200 bg-white p-4 shadow-am-sm transition-all duration-am-fast ease-am-ease hover:-translate-y-0.5 hover:shadow-am-card-hover hover:border-am-surface-300">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-am-primary-50 text-am-primary-600">{getTypeIcon(appointment.type)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <h3 className="font-medium text-am-surface-900">{appointment.patient_id ? (patientNames[appointment.patient_id] || 'Cargando...') : 'Sin asignar'}</h3>
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${getStatusColor(appointment.status ?? 'scheduled')}`}>{appointment.status ?? 'scheduled'}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-sm text-am-surface-500 mb-2">
                          <div className="flex items-center gap-1"><Calendar className="h-4 w-4" />{new Date(appointment.start_time).toLocaleDateString('es-ES')}</div>
                          <div className="flex items-center gap-1"><Clock className="h-4 w-4" />{new Date(appointment.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} ({appointment.duration_minutes ?? 30} min)</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start shrink-0 sm:self-auto">
                      {appointment.type === 'telemedicine' && resolvedDoctorId && appointment.patient_id && (() => {
                        const windowStatus = getCallWindowStatus(appointment)
                        return (
                          <StartCallButton
                            doctorId={resolvedDoctorId}
                            patientId={appointment.patient_id}
                            patientName={patientNames[appointment.patient_id] || 'Paciente'}
                            appointmentId={appointment.id}
                            disabled={!windowStatus.isOpen}
                            callWindowMessage={windowStatus.isOpen ? undefined : windowStatus.message}
                            className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-am-sm transition hover:bg-green-700"
                          />
                        )
                      })()}
                      <button 
                        type="button" 
                        onClick={() => {
                          setEditingAppointment(appointment);
                          setIsCreateModalOpen(true);
                        }}
                        className="rounded-lg bg-white border border-am-surface-300 px-3 py-2 text-sm font-medium text-am-surface-700 shadow-am-sm transition hover:bg-am-surface-100"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {(isCreateModalOpen || !!editingAppointment) && (
          <CreateAppointmentModal 
              onClose={() => {
                setIsCreateModalOpen(false);
                setEditingAppointment(null);
              }}
              onSaved={handleSaveAppointment}
              appointment={editingAppointment}
          />
      )}
    </div>
  )
}
