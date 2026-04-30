import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@autamedica/shared', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
  domainEvents: { emit: mockEmit },
}))

vi.mock('@/lib/doctors/lib/resolve-room', () => ({
  resolveDoctorId: vi.fn().mockResolvedValue('doctor-1'),
  doctorHasPatientAccess: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/calls/lib/telemedicine-window', () => ({
  isTelemedicineCallWindowOpen: vi.fn().mockReturnValue(true),
}))

vi.mock('@/lib/doctors/services/appointment.backend', () => ({
  appointmentBackendService: {
    transitionStatus: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@/lib/calls/lib/doctor-videoconsulta-credits', () => ({
  canDoctorStartVideoconsulta: vi.fn().mockResolvedValue({ allowed: true }),
}))

vi.mock('@/lib/payments/services/appointment-payments.service', () => ({
  appointmentPaymentsService: {
    hasApprovedPayment: vi.fn().mockResolvedValue(true),
  },
}))

import { startTeleconsultationUseCase } from './start-teleconsultation.usecase'
import type { ICallStartRepository } from '@/lib/calls/ports/call-start.port'
import type { Call } from '@autamedica/telemedicine'

function makeRepo(overrides: Partial<ICallStartRepository> = {}): ICallStartRepository {
  const createdCall: Call = {
    id: 'call-1',
    room_id: 'room-1',
    doctor_id: 'doctor-1',
    patient_id: 'patient-1',
    status: 'requested',
    created_at: '2026-04-17T10:00:00.000Z',
    appointment_id: null,
  }

  return {
    findAppointmentById: vi.fn().mockResolvedValue(null),
    findPatientById: vi.fn().mockResolvedValue({ id: 'patient-1' }),
    findActiveByAppointmentId: vi.fn().mockResolvedValue(null),
    findActiveByParticipants: vi.fn().mockResolvedValue(null),
    listPendingByParticipants: vi.fn().mockResolvedValue([]),
    createCall: vi.fn().mockResolvedValue(createdCall),
    updateCallStatus: vi.fn().mockResolvedValue(true),
    cancelCallsBatch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('startTeleconsultationUseCase — call.started emit', () => {
  beforeEach(() => {
    mockEmit.mockClear()
  })

  it('emits call.started with the expected payload when a new call is created', async () => {
    const adminCallRepo = makeRepo()
    const actorCallRepo = makeRepo()

    const result = await startTeleconsultationUseCase(
      {
        adminCallRepo,
        actorCallRepo,
        adminDb: {} as any,
      },
      {
        doctorUserId: 'user-doctor-1',
        patientId: 'patient-1',
      },
    )

    expect(result.kind).toBe('ok')
    expect(mockEmit).toHaveBeenCalledTimes(1)
    expect(mockEmit).toHaveBeenCalledWith('call.started', {
      callId: 'call-1',
      roomId: 'room-1',
      doctorId: 'doctor-1',
      patientId: 'patient-1',
    })
  })

  it('allows starting a scheduled telemedicine appointment inside the call window', async () => {
    const scheduledAppointment = {
      id: 'appointment-scheduled-1',
      doctor_id: 'doctor-1',
      patient_id: 'patient-1',
      type: 'telemedicine',
      status: 'scheduled',
      start_time: '2026-04-17T10:00:00.000Z',
      end_time: '2026-04-17T10:30:00.000Z',
      duration_minutes: 30,
    }
    const createCall = vi.fn().mockResolvedValue({
      id: 'call-scheduled-1',
      room_id: 'room-scheduled-1',
      doctor_id: 'doctor-1',
      patient_id: 'patient-1',
      status: 'requested',
      created_at: '2026-04-17T10:00:00.000Z',
      appointment_id: 'appointment-scheduled-1',
    } satisfies Call)
    const adminCallRepo = makeRepo({
      findAppointmentById: vi.fn().mockResolvedValue(scheduledAppointment),
    })
    const actorCallRepo = makeRepo({ createCall })

    const result = await startTeleconsultationUseCase(
      {
        adminCallRepo,
        actorCallRepo,
        adminDb: {} as any,
      },
      {
        doctorUserId: 'user-doctor-1',
        patientId: 'patient-1',
        appointmentId: 'appointment-scheduled-1',
      },
    )

    expect(result.kind).toBe('ok')
    expect(createCall).toHaveBeenCalledWith('doctor-1', 'patient-1', 'appointment-scheduled-1')
  })

  it('starts a guest appointment call without requiring an internal patient id', async () => {
    const guestAppointment = {
      id: 'appointment-guest-1',
      doctor_id: 'doctor-1',
      patient_id: null,
      type: 'telemedicine',
      status: 'confirmed',
      start_time: '2026-04-17T10:00:00.000Z',
      end_time: '2026-04-17T10:30:00.000Z',
      duration_minutes: 30,
    }
    const guestCall: Call = {
      id: 'call-guest-1',
      room_id: 'room-guest-1',
      doctor_id: 'doctor-1',
      patient_id: null,
      status: 'requested',
      created_at: '2026-04-17T10:00:00.000Z',
      appointment_id: 'appointment-guest-1',
    }
    const findPatientById = vi.fn()
    const createCall = vi.fn().mockResolvedValue(guestCall)
    const adminCallRepo = makeRepo({
      findAppointmentById: vi.fn().mockResolvedValue(guestAppointment),
      findPatientById,
    })
    const actorCallRepo = makeRepo({ createCall })

    const result = await startTeleconsultationUseCase(
      {
        adminCallRepo,
        actorCallRepo,
        adminDb: {} as any,
      },
      {
        doctorUserId: 'user-doctor-1',
        patientId: null,
        appointmentId: 'appointment-guest-1',
      },
    )

    expect(result.kind).toBe('ok')
    expect(findPatientById).not.toHaveBeenCalled()
    expect(createCall).toHaveBeenCalledWith('doctor-1', null, 'appointment-guest-1')
    expect(mockEmit).toHaveBeenCalledWith('call.started', {
      callId: 'call-guest-1',
      roomId: 'room-guest-1',
      doctorId: 'doctor-1',
      patientId: null,
    })
  })

  it('does NOT emit call.started when the call is reused (already exists)', async () => {
    const existingCall: Call = {
      id: 'call-existing',
      room_id: 'room-existing',
      doctor_id: 'doctor-1',
      patient_id: 'patient-1',
      status: 'ringing',
      created_at: '2026-04-17T09:00:00.000Z',
      appointment_id: null,
    }

    const adminCallRepo = makeRepo({
      findActiveByParticipants: vi.fn().mockResolvedValue(existingCall),
    })
    const actorCallRepo = makeRepo()

    const result = await startTeleconsultationUseCase(
      {
        adminCallRepo,
        actorCallRepo,
        adminDb: {} as any,
      },
      {
        doctorUserId: 'user-doctor-1',
        patientId: 'patient-1',
      },
    )

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.data.reused).toBe(true)
    }
    expect(mockEmit).not.toHaveBeenCalled()
  })

  it('does not throw when the emit handler fails — call start flow stays green', async () => {
    mockEmit.mockRejectedValueOnce(new Error('handler blew up'))

    const adminCallRepo = makeRepo()
    const actorCallRepo = makeRepo()

    const result = await startTeleconsultationUseCase(
      {
        adminCallRepo,
        actorCallRepo,
        adminDb: {} as any,
      },
      {
        doctorUserId: 'user-doctor-1',
        patientId: 'patient-1',
      },
    )

    expect(result.kind).toBe('ok')
    expect(mockEmit).toHaveBeenCalledTimes(1)
  })
})
