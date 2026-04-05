import { describe, expect, it, vi } from 'vitest'
import { ScheduleDoctorAppointmentUseCase } from './ScheduleDoctorAppointmentUseCase'

describe('ScheduleDoctorAppointmentUseCase', () => {
  it('creates an appointment and emits appointment.scheduled', async () => {
    const appointmentRepo = {
      create: vi.fn().mockResolvedValue({
        id: 'apt-1',
        patient_id: 'pat-1',
        doctor_id: 'doc-1',
        start_time: '2026-04-04T14:00:00.000Z',
      }),
      update: vi.fn(),
      cancel: vi.fn(),
    }

    const patientRepo = {
      findAllActive: vi.fn(),
      findById: vi.fn().mockResolvedValue({ id: 'pat-1' }),
      findByUserId: vi.fn(),
      findByCompany: vi.fn(),
      findByDoctorUserId: vi.fn(),
    }

    const eventBus = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn(),
    }

    const useCase = new ScheduleDoctorAppointmentUseCase({
      appointmentRepo,
      patientRepo,
      eventBus,
    })

    const result = await useCase.execute(
      { doctorId: 'doc-1' },
      {
        patient_id: 'pat-1',
        start_time: '2026-04-04T14:00:00.000Z',
        duration_minutes: 30,
        type: 'consultation',
        notes: 'Control clínico breve',
        location: 'Consultorio 3',
      },
    )

    expect(appointmentRepo.create).toHaveBeenCalledWith(
      'pat-1',
      expect.objectContaining({
        doctor_id: 'doc-1',
        start_time: '2026-04-04T14:00:00.000Z',
        duration_minutes: 30,
        type: 'consultation',
      }),
    )
    expect(eventBus.emit).toHaveBeenCalledWith('appointment.scheduled', {
      appointmentId: 'apt-1',
      doctorId: 'doc-1',
      patientId: 'pat-1',
      startTime: '2026-04-04T14:00:00.000Z',
    })
    expect(result.id).toBe('apt-1')
  })

  it('fails when patient does not exist', async () => {
    const useCase = new ScheduleDoctorAppointmentUseCase({
      appointmentRepo: {
        create: vi.fn(),
        update: vi.fn(),
        cancel: vi.fn(),
      },
      patientRepo: {
        findAllActive: vi.fn(),
        findById: vi.fn().mockResolvedValue(null),
        findByUserId: vi.fn(),
        findByCompany: vi.fn(),
        findByDoctorUserId: vi.fn(),
      },
      eventBus: {
        on: vi.fn(),
        off: vi.fn(),
        emit: vi.fn(),
        clear: vi.fn(),
      },
    })

    await expect(
      useCase.execute(
        { doctorId: 'doc-1' },
        {
          patient_id: 'missing',
          start_time: '2026-04-04T14:00:00.000Z',
          duration_minutes: 30,
          type: 'consultation',
        },
      ),
    ).rejects.toMatchObject({
      message: 'Patient not found or inactive',
      code: 'PATIENT_NOT_FOUND',
    })
  })
})
