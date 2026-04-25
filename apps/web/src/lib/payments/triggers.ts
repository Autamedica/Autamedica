import { domainEvents, logger } from '@autamedica/shared';
import { createAstroAdminClient } from '@/lib/supabase';
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service';

/**
 * Register background triggers for payment-related side effects.
 * This ensures that when an appointment is completed (via call or manual transition),
 * the doctor earning is recorded.
 */
function registerPaymentTriggers() {
  type GlobalState = typeof globalThis & {
    __autamedicaPaymentTriggersInitialized__?: boolean;
  };
  const globalState = globalThis as GlobalState;
  if (globalState.__autamedicaPaymentTriggersInitialized__) {
    return;
  }
  globalState.__autamedicaPaymentTriggersInitialized__ = true;

  logger.info('[paymentTriggers] Registering payment-related domain event listeners');

  domainEvents.on('appointment.completed', async ({ appointmentId }) => {
    try {
      const admin = createAstroAdminClient();
      await appointmentPaymentsService.createDoctorEarningForAppointment(admin, appointmentId);
      logger.info(`[paymentTriggers] Doctor earning processed for completed appointment ${appointmentId}`);
    } catch (error) {
      logger.error(`[paymentTriggers] Failed to create doctor earning for appointment ${appointmentId}`, error);
    }
  });
}

// Auto-register when imported
registerPaymentTriggers();

export const paymentTriggers = {
  initialized: true,
};
