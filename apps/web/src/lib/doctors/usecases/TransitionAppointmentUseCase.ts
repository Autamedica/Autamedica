/**
 * Use Case: TransitionAppointment
 * Orchestrates valid state transitions for appointments.
 * Layer 7: Use Case Layer.
 */
import { updateAppointment, getAppointment, type UiAppointment } from '@/lib/doctors/lib/repos/appointments';

export type AppointmentStatus = 'scheduled' | 'confirmed' | 'in_progress' | 're_queue' | 'completed' | 'cancelled';

export class TransitionAppointmentUseCase {
  constructor() {}

  /**
   * Orchestrates the transition of an appointment status.
   * Ensures business rules are met before updating the database.
   */
  async execute(appointmentId: string, nextStatus: AppointmentStatus): Promise<UiAppointment> {
    const appointment = await getAppointment(appointmentId);
    if (!appointment) {
      throw new Error('Appointment not found');
    }

    if (!this.isValidTransition(appointment.status as AppointmentStatus, nextStatus)) {
      throw new Error(`Invalid transition from ${appointment.status} to ${nextStatus}`);
    }

    // Perform the update
    return await updateAppointment(appointmentId, { status: nextStatus });
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
