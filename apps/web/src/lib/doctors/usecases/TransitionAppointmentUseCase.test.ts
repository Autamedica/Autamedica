import { describe, it, expect, vi } from 'vitest';
import { TransitionAppointmentUseCase } from './TransitionAppointmentUseCase';
import type { IAppointmentReadRepository, AppointmentView } from '@autamedica/types';

function createMockRepo(overrides: Partial<IAppointmentReadRepository> = {}): IAppointmentReadRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    findById: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
    ...overrides,
  };
}

describe('TransitionAppointmentUseCase', () => {
  it('should successfully transition from scheduled to in_progress', async () => {
    const mockAppointment = { id: 'apt-1', status: 'scheduled' } as AppointmentView;
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(mockAppointment),
      update: vi.fn().mockResolvedValue({ ...mockAppointment, status: 'in_progress' }),
    });
    const useCase = new TransitionAppointmentUseCase({ appointmentRepo: repo });

    const result = await useCase.execute('apt-1', 'in_progress');

    expect(result.status).toBe('in_progress');
    expect(repo.update).toHaveBeenCalledWith('apt-1', { status: 'in_progress' });
  });

  it('should throw an error for invalid transition (scheduled to completed)', async () => {
    const mockAppointment = { id: 'apt-1', status: 'scheduled' } as AppointmentView;
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(mockAppointment),
    });
    const useCase = new TransitionAppointmentUseCase({ appointmentRepo: repo });

    await expect(useCase.execute('apt-1', 'completed')).rejects.toThrow('Invalid transition from scheduled to completed');
  });

  it('should successfully transition from confirmed to no_show', async () => {
    const mockAppointment = { id: 'apt-1', status: 'confirmed' } as AppointmentView;
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(mockAppointment),
      update: vi.fn().mockResolvedValue({ ...mockAppointment, status: 'no_show' }),
    });
    const useCase = new TransitionAppointmentUseCase({ appointmentRepo: repo });

    const result = await useCase.execute('apt-1', 'no_show');

    expect(result.status).toBe('no_show');
    expect(repo.update).toHaveBeenCalledWith('apt-1', { status: 'no_show' });
  });

  it('should successfully transition from no_show to in_progress', async () => {
    const mockAppointment = { id: 'apt-1', status: 'no_show' } as AppointmentView;
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(mockAppointment),
      update: vi.fn().mockResolvedValue({ ...mockAppointment, status: 'in_progress' }),
    });
    const useCase = new TransitionAppointmentUseCase({ appointmentRepo: repo });

    const result = await useCase.execute('apt-1', 'in_progress');

    expect(result.status).toBe('in_progress');
    expect(repo.update).toHaveBeenCalledWith('apt-1', { status: 'in_progress' });
  });

  it('should throw an error if appointment not found', async () => {
    const repo = createMockRepo({
      findById: vi.fn().mockResolvedValue(null),
    });
    const useCase = new TransitionAppointmentUseCase({ appointmentRepo: repo });

    await expect(useCase.execute('non-existent', 'in_progress')).rejects.toThrow('Appointment not found');
  });
});
