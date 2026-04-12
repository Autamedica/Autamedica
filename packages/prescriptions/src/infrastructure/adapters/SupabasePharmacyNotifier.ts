import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IPharmacyNotifier,
  DispensationOrderId,
} from '../../domain/pharmacy.ports';
import type { PharmacyAuditEventType } from '../../domain/pharmacy.models';
import { logger } from '@autamedica/shared';

export class SupabasePharmacyNotifier implements IPharmacyNotifier {
  constructor(private readonly supabase: SupabaseClient) {}

  async notifyClarificationRequested(
    doctorUserId: string,
    orderId: DispensationOrderId,
    question: string,
    category: string
  ): Promise<void> {
    await this.insertNotification(
      doctorUserId,
      'clarification_requested',
      'Se requiere aclaración sobre receta',
      `Categoría: ${category}. ${question}`,
      { orderId, question, category }
    );
  }

  async notifyClarificationResponded(
    pharmacistUserId: string,
    orderId: DispensationOrderId
  ): Promise<void> {
    await this.insertNotification(
      pharmacistUserId,
      'clarification_responded',
      'Aclaración respondida por el prescriptor',
      'El prescriptor respondió a la consulta sobre la receta.',
      { orderId }
    );
  }

  async notifyDispensationCompleted(
    doctorUserId: string,
    orderId: DispensationOrderId,
    eventType: PharmacyAuditEventType
  ): Promise<void> {
    await this.insertNotification(
      doctorUserId,
      'dispensation_completed',
      'Dispensación completada',
      `La farmacia completó la dispensación. Evento: ${eventType}`,
      { orderId, eventType }
    );
  }

  private async insertNotification(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const { error } = await this.supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        body,
        data,
        read: false,
        created_at: new Date().toISOString(),
      });

    if (error) {
      logger.warn('[PharmacyNotifier] notifications table insert failed, falling back to audit log', error);
      const { error: auditError } = await this.supabase
        .from('pharmacy_audit_events')
        .insert({
          order_id: data.orderId ?? null,
          event_type: type,
          actor_id: userId,
          actor_role: 'system',
          details: { title, body, ...data },
        });
      if (auditError) {
        logger.error('[PharmacyNotifier] Failed to log fallback audit event', auditError);
        throw auditError;
      }
    }
  }
}
