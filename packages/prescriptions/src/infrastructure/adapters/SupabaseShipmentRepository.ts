import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  IShipmentRepository,
  CreatedShipment,
  ShipmentDraft,
  ShipmentEventInput,
  ShipmentStatus,
} from '../../domain/shipping.ports';

export class SupabaseShipmentRepository implements IShipmentRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async persist(shipment: CreatedShipment, draft: ShipmentDraft): Promise<void> {
    const { error } = await this.supabase.from('shipments').insert({
      id: shipment.id,
      dispensation_order_id: draft.dispensationOrderId,
      courier: shipment.courier,
      tracking_number: shipment.trackingNumber,
      courier_order_id: shipment.courierOrderId,
      recipient_name: draft.recipientName,
      recipient_phone: draft.recipientPhone,
      recipient_address: draft.recipientAddress,
      service_level: draft.serviceLevel,
      status: shipment.status,
      estimated_delivery_at: shipment.estimatedDeliveryAt ?? null,
      label_pdf_url: shipment.labelPdfUrl ?? null,
      cost_ars: shipment.costArs ?? null,
      metadata: draft.metadata ?? {},
    });
    if (error) throw new Error(`persist shipment: ${error.message}`);
  }

  async recordEvent(input: ShipmentEventInput): Promise<void> {
    const { error } = await this.supabase.from('shipment_events').insert({
      shipment_id: input.shipmentId,
      event_type: input.eventType,
      event_time: input.eventTime,
      location: input.location ?? null,
      description: input.description ?? null,
      raw_webhook: input.rawWebhook ?? null,
    });
    if (error) throw new Error(`record shipment event: ${error.message}`);
  }

  async updateStatus(shipmentId: string, status: ShipmentStatus, deliveredAt?: string): Promise<void> {
    const patch: Record<string, unknown> = { status };
    if (status === 'delivered' && deliveredAt) patch.delivered_at = deliveredAt;
    const { error } = await this.supabase
      .from('shipments')
      .update(patch)
      .eq('id', shipmentId);
    if (error) throw new Error(`update shipment status: ${error.message}`);
  }
}
