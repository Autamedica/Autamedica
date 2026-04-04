/**
 * Use Case: TransitionAppointment
 * Orchestrates valid state transitions for appointments.
 * Layer 7: Use Case Layer.
 */
import type { IAppointmentReadRepository, AppointmentView } from '@autamedica/types';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'in_progress' | 're_queue' | 'completed' | 'cancelled';

interface TransitionAppointmentDeps {
  appointmentRepo: IAppointmentReadRepository
}

export class TransitionAppointmentUseCase {
  constructor(private readonly deps: TransitionAppointmentDeps) {}

  async execute(appointmentId: string, nextStatus: AppointmentStatus): Promise<AppointmentView> {
    const appointment = await this.deps.appointmentRepo.findById(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (!this.isValidTransition(appointment.status as AppointmentStatus, nextStatus)) {
      throw new Error(`Invalid transition from ${appointment.status} to ${nextStatus}`);
    }

    return await this.deps.appointmentRepo.update(appointmentId, { status: nextStatus });
  }

  private isValidTransition(current: AppointmentStatus, next: AppointmentStatus): boolean {
    const transitions: Record<AppointmentStatus, AppointmentStatus[]> = {
      scheduled: ['confirmed', 'cancelled', 'in_progress'],
      confirmed: ['in_progress', 'cancelled'],
      in_progress: ['completed', 're_queue'],
      re_queue: ['scheduled', 'cancelled'],
      completed: [],
      cancelled: [],
    };

    return transitions[current]?.includes(next) ?? false;
  }
}
