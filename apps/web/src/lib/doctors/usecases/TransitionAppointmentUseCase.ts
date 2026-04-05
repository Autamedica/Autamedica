/**
 * Use Case: TransitionAppointment
 * Orchestrates valid state transitions for appointments.
 * Layer 7: Use Case Layer.
 */
import type { IAppointmentReadRepository, AppointmentView, AppointmentStatus } from '@autamedica/types';

type InternalStatus = AppointmentStatus | 're_queue' | 'no_show';

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

    if (!this.isValidTransition(appointment.status as InternalStatus, nextStatus as InternalStatus)) {
      throw new Error(`Invalid transition from ${appointment.status} to ${nextStatus}`);
    }

    return await this.deps.appointmentRepo.update(appointmentId, { status: nextStatus });
  }

  private isValidTransition(current: InternalStatus, next: InternalStatus): boolean {
    const transitions: Record<InternalStatus, InternalStatus[]> = {
      scheduled: ['confirmed', 'cancelled', 'in_progress', 'no_show'],
      confirmed: ['in_progress', 'cancelled', 'no_show'],
      in_progress: ['completed', 're_queue'],
      re_queue: ['scheduled', 'cancelled'],
      completed: [],
      cancelled: [],
      no_show: ['scheduled'],
    };

    return transitions[current]?.includes(next) ?? false;
  }
}
