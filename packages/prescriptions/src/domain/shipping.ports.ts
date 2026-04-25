import type { DispensationOrderId } from './pharmacy.models';

export type ShipmentCourier = 'andreani_farma' | 'oca_farma' | 'urbano' | 'cadetería_local';

export type ShipmentStatus =
  | 'label_pending'
  | 'label_created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'delivery_failed'
  | 'returned'
  | 'cancelled';

export type ServiceLevel = 'same_day' | 'next_day' | 'standard' | 'cold_chain';

export interface ShippingAddress {
  street: string;
  number: string;
  floor?: string;
  apartment?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  reference?: string;
}

export interface ShipmentDraft {
  dispensationOrderId: DispensationOrderId;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: ShippingAddress;
  serviceLevel: ServiceLevel;
  metadata?: Record<string, unknown>;
}

export interface CreatedShipment {
  id: string;
  courier: ShipmentCourier;
  trackingNumber: string;
  courierOrderId: string;
  labelPdfUrl?: string;
  estimatedDeliveryAt?: string;
  costArs?: number;
  status: ShipmentStatus;
}

export interface ShipmentEventInput {
  shipmentId: string;
  eventType: string;
  eventTime: string;
  location?: string;
  description?: string;
  rawWebhook?: Record<string, unknown>;
}

export interface IShippingService {
  readonly courier: ShipmentCourier;
  createShipment(draft: ShipmentDraft): Promise<CreatedShipment>;
  track(trackingNumber: string, shipmentId: string): Promise<{ status: ShipmentStatus; events: ShipmentEventInput[] }>;
  cancel(trackingNumber: string): Promise<void>;
}

export interface IShipmentRepository {
  persist(shipment: CreatedShipment, draft: ShipmentDraft): Promise<void>;
  recordEvent(input: ShipmentEventInput): Promise<void>;
  updateStatus(shipmentId: string, status: ShipmentStatus, deliveredAt?: string): Promise<void>;
}
