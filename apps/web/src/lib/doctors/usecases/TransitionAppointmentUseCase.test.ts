import { describe, it, expect, vi } from 'vitest';
import { TransitionAppointmentUseCase } from './TransitionAppointmentUseCase';
import * as repo from '@/lib/doctors/lib/repos/appointments';

// Mock the repository
vi.mock('@/lib/doctors/lib/repos/appointments', () => ({
  getAppointment: vi.fn(),
  updateAppointment: vi.fn(),
}));

describe('TransitionAppointmentUseCase', () => {
  const useCase = new TransitionAppointmentUseCase();

  it('should successfully transition from scheduled to in_progress', async () => {
    const mockAppointment = { id: 'apt-1', status: 'scheduled' } as any;
    vi.mocked(repo.getAppointment).mockResolvedValue(mockAppointment);
    vi.mocked(repo.updateAppointment).mockResolvedValue({ ...mockAppointment, status: 'in_progress' });

    const result = await useCase.execute('apt-1', 'in_progress');

    expect(result.status).toBe('in_progress');
    expect(repo.updateAppointment).toHaveBeenCalledWith('apt-1', { status: 'in_progress' });
  });

  it('should throw an error for invalid transition (scheduled to completed)', async () => {
    const mockAppointment = { id: 'apt-1', status: 'scheduled' } as any;
    vi.mocked(repo.getAppointment).mockResolvedValue(mockAppointment);

    await expect(useCase.execute('apt-1', 'completed')).rejects.toThrow('Invalid transition from scheduled to completed');
  });

  it('should throw an error if appointment not found', async () => {
    vi.mocked(repo.getAppointment).mockResolvedValue(null);

    await expect(useCase.execute('non-existent', 'in_progress')).rejects.toThrow('Appointment not found');
  });
});
