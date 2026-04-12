/**
 * Backend Service: Appointment Workflow
 * Layer 8: Backend Service Layer.
 */
import { TransitionAppointmentUseCase } from '../usecases/TransitionAppointmentUseCase';
import { createAppointmentReadAdapter } from '@/lib/doctors/lib/repos/appointments';
import { createAstroAdminClient } from '@/lib/supabase';
import { logger } from '@autamedica/shared';
import type { AppointmentView, AppointmentStatus } from '@autamedica/types';

export const appointmentBackendService = {
  async transitionStatus(
    appointmentId: string,
    nextStatus: AppointmentStatus,
    runtimeEnv?: Record<string, unknown> | null,
  ): Promise<AppointmentView> {
    try {
      const admin = createAstroAdminClient(runtimeEnv);
      const useCase = new TransitionAppointmentUseCase({
        appointmentRepo: createAppointmentReadAdapter(admin),
      });
      return await useCase.execute(appointmentId, nextStatus);
    } catch (error) {
      logger.error('[appointmentBackendService] transitionStatus failed', { appointmentId, nextStatus, error });
      throw error;
    }
  }
};
