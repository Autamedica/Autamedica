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
      'doctor',
      'clarification',
      'clarification_requested',
      'Se requiere aclaración sobre receta',
      `Categoría: ${category}. ${question}`,
      { orderId, question, category },
      `pharmacy:clarification_requested:${orderId}`
    );
  }

  async notifyClarificationResponded(
    pharmacistUserId: string,
    orderId: DispensationOrderId
  ): Promise<void> {
    // TODO(#309): portal_notifications.audience CHECK IN ('patient','doctor','company','admin')
    // no soporta 'pharmacist'. El destinatario semánticamente correcto es el farmacéutico que
    // solicitó la aclaración, no el doctor. Requiere migración que extienda el CHECK y alinear
    // policies RLS + portal de pharmacy. Mientras tanto, se persiste en pharmacy_audit_events.
    logger.warn(
      '[PharmacyNotifier] Skipping portal notification for pharmacist clarification response: unsupported audience',
      { pharmacistUserId, orderId }
    );
    await this.insertAuditFallback(
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
      'doctor',
      'prescription',
      'dispensation_completed',
      'Dispensación completada',
      `La farmacia completó la dispensación. Evento: ${eventType}`,
      { orderId, eventType },
      `pharmacy:dispensation_completed:${orderId}:${eventType}`
    );
  }

  private async insertNotification(
    userId: string,
    audience: 'doctor',
    category: 'clarification' | 'prescription',
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown>,
    dedupeKey: string
  ): Promise<void> {
    const { data: existing, error: existingError } = await this.supabase
      .from('portal_notifications')
      .select('id')
      .eq('user_id', userId)
      .eq('audience', audience)
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();

    if (existingError) {
      logger.warn(
        '[PharmacyNotifier] portal_notifications lookup failed, falling back to audit log',
        existingError
      );
      await this.insertAuditFallback(userId, type, title, body, data);
      return;
    }

    if (existing) {
      return;
    }

    const { error } = await this.supabase
      .from('portal_notifications')
      .insert({
        user_id: userId,
        audience,
        category,
        type,
        title,
        body,
        action_url: '/doctors/consultations',
        action_label: 'Ver detalle',
        priority: category === 'clarification' ? 'urgent' : 'normal',
        dedupe_key: dedupeKey,
        context_data: data,
        created_at: new Date().toISOString(),
      });

    if (error) {
      logger.warn(
        '[PharmacyNotifier] portal_notifications insert failed, falling back to audit log',
        error
      );
      await this.insertAuditFallback(userId, type, title, body, data);
    }
  }

  private async insertAuditFallback(
    userId: string,
    type: string,
    title: string,
    body: string,
    data: Record<string, unknown>
  ): Promise<void> {
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
