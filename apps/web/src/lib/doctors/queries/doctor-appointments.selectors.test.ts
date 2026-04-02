import { describe, expect, it } from 'vitest'

import type { Appointment } from '@autamedica/types'

import {
  selectDoctorAppointmentBoardView,
  selectDoctorDailyAgendaView,
  selectDoctorPatientAppointmentInsights,
} from './doctor-appointments.selectors'

const asUuid = (value: string) => value as unknown as Appointment['id']
const asIso = (value: string) => value as unknown as Appointment['start_time']

function buildAppointment(overrides: Partial<Appointment> & Pick<Appointment, 'id' | 'start_time'>): Appointment {
  return {
    patient_id: null as unknown as Appointment['patient_id'],
    doctor_id: null as unknown as Appointment['doctor_id'],
    end_time: null as unknown as Appointment['end_time'],
    duration_minutes: 30,
    type: 'consultation',
    status: 'scheduled',
    notes: null,
    location: null,
    meeting_url: null,
    created_by: null as unknown as Appointment['created_by'],
    created_at: asIso('2026-04-02T10:00:00.000Z'),
    updated_at: asIso('2026-04-02T10:00:00.000Z'),
    deleted_at: null as unknown as Appointment['deleted_at'],
    ...overrides,
  } as Appointment
}

describe('doctor appointment selectors', () => {
  it('sorts agenda and counts appointments consistently', () => {
    const now = new Date('2026-04-02T12:00:00.000Z').getTime()
    const appointments = [
      buildAppointment({
        id: asUuid('c'),
        start_time: asIso('2026-04-02T16:00:00.000Z'),
        type: 'telemedicine',
        status: 'confirmed',
      }),
      buildAppointment({
        id: asUuid('a'),
        start_time: asIso('2026-04-02T09:00:00.000Z'),
        status: 'completed',
      }),
      buildAppointment({
        id: asUuid('b'),
        start_time: asIso('2026-04-02T13:00:00.000Z'),
        type: 'telemedicine',
        status: 'scheduled',
      }),
    ]

    const board = selectDoctorAppointmentBoardView(appointments, now)

    expect(board.sortedAppointments.map((appointment) => appointment.id)).toEqual(['b', 'c', 'a'])
    expect(board.todayCount).toBe(3)
    expect(board.telemedicineCount).toBe(2)
    expect(board.pendingCount).toBe(1)
    expect(board.confirmedCount).toBe(1)
  })

  it('derives daily agenda and patient insights from the same appointment list', () => {
    const referenceDate = new Date('2026-04-02T12:00:00.000Z')
    const appointments = [
      buildAppointment({
        id: asUuid('upcoming-1'),
        patient_id: asUuid('patient-1'),
        start_time: asIso('2026-04-02T13:00:00.000Z'),
        status: 'scheduled',
      }),
      buildAppointment({
        id: asUuid('upcoming-2'),
        patient_id: asUuid('patient-2'),
        start_time: asIso('2026-04-02T15:00:00.000Z'),
        status: 'confirmed',
      }),
      buildAppointment({
        id: asUuid('completed-1'),
        patient_id: asUuid('patient-1'),
        start_time: asIso('2026-03-30T11:00:00.000Z'),
        status: 'completed',
      }),
      buildAppointment({
        id: asUuid('today-past'),
        patient_id: asUuid('patient-3'),
        start_time: asIso('2026-04-02T08:00:00.000Z'),
        status: 'cancelled',
      }),
    ]

    const agenda = selectDoctorDailyAgendaView(appointments, referenceDate)
    const insights = selectDoctorPatientAppointmentInsights(appointments, referenceDate.getTime())

    expect(agenda.todayAppointments.map((appointment) => appointment.id)).toEqual(['upcoming-1', 'upcoming-2'])
    expect(agenda.upcomingToday.map((appointment) => appointment.id)).toEqual(['upcoming-1', 'upcoming-2'])
    expect(agenda.weekCount).toBe(3)
    expect(insights.upcomingAppointmentsCount).toBe(2)
    expect(insights.nextAppointmentByPatient.get('patient-1')?.id).toBe('upcoming-1')
    expect(insights.completedByPatient.get('patient-1')).toBe(1)
  })
})
