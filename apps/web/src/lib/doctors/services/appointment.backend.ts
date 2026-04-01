/**
 * Backend Service: Appointment Workflow
 * Layer 8: Backend Service Layer.
 */
import { TransitionAppointmentUseCase } from '../usecases/TransitionAppointmentUseCase';
import type { AppointmentStatus } from '../usecases/TransitionAppointmentUseCase';
import { logger } from '@autamedica/shared';
import type { UiAppointment } from '@/lib/doctors/lib/repos/appointments';

export const appointmentBackendService = {
  async transitionStatus(appointmentId: string, nextStatus: AppointmentStatus): Promise<UiAppointment> {
    try {
      const useCase = new TransitionAppointmentUseCase();
      return await useCase.execute(appointmentId, nextStatus);
    } catch (error) {
      logger.error('[appointmentBackendService] transitionStatus failed', { appointmentId, nextStatus, error });
      throw error;
    }
  }
};
