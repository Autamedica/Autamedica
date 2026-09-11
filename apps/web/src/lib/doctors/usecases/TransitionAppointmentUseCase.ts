/**
 * Use Case: TransitionAppointment
 * Orchestrates valid state transitions for appointments.
 * Layer 7: Use Case Layer.
 */
import type { IAppointmentReadRepository, AppointmentView, AppointmentStatus } from '@autamedica/types';
import { logger, domainEvents } from '@autamedica/shared';

type InternalStatus = AppointmentStatus | 'no_show';

export class AppointmentTransitionError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'AppointmentTransitionError';
  }
}

interface TransitionAppointmentDeps {
  appointmentRepo: IAppointmentReadRepository;
}

export class TransitionAppointmentUseCase {
  constructor(private readonly deps: TransitionAppointmentDeps) {}

  async execute(appointmentId: string, nextStatus: AppointmentStatus): Promise<AppointmentView> {
    try {
      const appointment = await this.deps.appointmentRepo.findById(appointmentId);
      
      if (!appointment) {
        throw new AppointmentTransitionError(`Appointment not found`, 'NOT_FOUND');
      }

      if (!this.isValidTransition(appointment.status as InternalStatus, nextStatus as InternalStatus)) {
        throw new AppointmentTransitionError(
          `Invalid transition from ${appointment.status} to ${nextStatus}`, 
          'INVALID_TRANSITION'
        );
      }

      const updated = await this.deps.appointmentRepo.update(appointmentId, { status: nextStatus });

      // Emit domain events based on the new status to decouple side-effects
      await this.publishDomainEvents(updated, nextStatus as InternalStatus);

      logger.info(`[TransitionAppointmentUseCase] Successfully transitioned appointment ${appointmentId} to ${nextStatus}`);
      return updated;
    } catch (error) {
      logger.error(`[TransitionAppointmentUseCase] Failed to transition appointment ${appointmentId}`, error);
      throw error;
    }
  }

  private async publishDomainEvents(appointment: AppointmentView, nextStatus: InternalStatus): Promise<void> {
    try {
      if (nextStatus === 'completed') {
        await domainEvents.emit('appointment.completed', {
          appointmentId: appointment.id,
          doctorId: appointment.doctorId,
          patientId: appointment.patientId || '',
        });
      } else if (nextStatus === 'cancelled') {
        await domainEvents.emit('appointment.cancelled', {
          appointmentId: appointment.id,
          cancelledBy: 'doctor',
          reason: 'Cancelled by doctor via transition',
        });
      }
    } catch (err) {
      // We don't want event publishing failures to fail the whole transition transaction,
      // but we must log them for observability.
      logger.error(`[TransitionAppointmentUseCase] Failed to publish domain event for status ${nextStatus}`, err);
    }
  }

  private isValidTransition(current: InternalStatus, next: InternalStatus): boolean {
    const transitions: Record<InternalStatus, ReadonlyArray<InternalStatus>> = {
      payment_pending: ['confirmed', 'cancelled'],
      scheduled: ['confirmed', 'cancelled', 'in_progress', 'no_show'],
      confirmed: ['in_progress', 'cancelled', 'no_show'],
      in_progress: ['completed'],
      completed: [],
      cancelled: [],
      no_show: [],
    };

    return transitions[current]?.includes(next) ?? false;
  }
}
