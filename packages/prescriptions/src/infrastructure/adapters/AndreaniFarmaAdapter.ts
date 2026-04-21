/**
 * AndreaniFarmaAdapter — envío última milla para psicofármacos.
 * Andreani Farma soporta cadena de frío (ColdChain) y validación de identidad al entregar.
 *
 * Docs Andreani API: https://developers.andreani.com/
 *   POST /v2/ordenes-de-envio  → crear etiqueta
 *   GET  /v2/ordenes-de-envio/:id/trazas  → tracking events
 *   DEL  /v2/ordenes-de-envio/:id  → cancelar
 */

import type {
  IShippingService,
  ShipmentDraft,
  CreatedShipment,
  ShipmentStatus,
  ShipmentEventInput,
} from '../../domain/shipping.ports';
import { logger } from '@autamedica/shared';
import { randomUUID } from 'node:crypto';

export interface AndreaniConfig {
  baseUrl: string;
  apiKey: string;
  contractId: string;
  originBranchId: string;
  returnAddress: {
    postalCode: string;
    street: string;
    number: string;
    city: string;
    province: string;
  };
  requestTimeoutMs?: number;
}

interface AndreaniCreateOrderResponse {
  numeroDeEnvio: string;
  numeroAndreani: string;
  etiqueta: { url: string };
  estimatedDeliveryDate?: string;
  costo?: { total: number };
  estado?: string;
}

interface AndreaniTrazaEvent {
  estado: string;
  fecha: string;
  sucursal?: string;
  observaciones?: string;
}

interface AndreaniTrackResponse {
  eventos: AndreaniTrazaEvent[];
  estadoActual: string;
}

const STATUS_MAP: Record<string, ShipmentStatus> = {
  'generada': 'label_created',
  'impresa': 'label_created',
  'ingresada_andreani': 'picked_up',
  'en_transito': 'in_transit',
  'en_distribucion': 'out_for_delivery',
  'entregada': 'delivered',
  'no_entregada': 'delivery_failed',
  'devolucion_origen': 'returned',
  'anulada': 'cancelled',
};

function mapStatus(andreaniState: string): ShipmentStatus {
  const key = andreaniState.toLowerCase().replace(/\s+/g, '_');
  return STATUS_MAP[key] ?? 'in_transit';
}

export class AndreaniFarmaAdapter implements IShippingService {
  readonly courier = 'andreani_farma' as const;

  constructor(private readonly config: AndreaniConfig) {
    if (!config.apiKey) throw new Error('Andreani apiKey required');
    if (!config.contractId) throw new Error('Andreani contractId required');
  }

  private async call<T>(method: 'POST' | 'GET' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'x-authorization-token': this.config.apiKey,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs ?? 15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Andreani ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async createShipment(draft: ShipmentDraft): Promise<CreatedShipment> {
    const addr = draft.recipientAddress;
    const payload = {
      contrato: this.config.contractId,
      origen: { postal: this.config.originBranchId },
      destinatario: {
        nombreCompleto: draft.recipientName,
        telefono: draft.recipientPhone,
        calle: addr.street,
        numero: addr.number,
        piso: addr.floor,
        departamento: addr.apartment,
        localidad: addr.city,
        provincia: addr.province,
        codigoPostal: addr.postalCode,
        pais: addr.country ?? 'AR',
        observaciones: addr.reference,
      },
      bulto: {
        peso: draft.metadata?.weightGrams ?? 500,
        volumen: draft.metadata?.volumeCm3 ?? 1000,
      },
      valorDeclarado: draft.metadata?.declaredValue ?? 0,
      servicio: this.mapServiceLevel(draft.serviceLevel),
      referencia: `DISP-${draft.dispensationOrderId}`,
    };

    logger.info(
      `[AndreaniFarmaAdapter] create shipment dispensation=${draft.dispensationOrderId} service=${draft.serviceLevel}`,
    );
    const response = await this.call<AndreaniCreateOrderResponse>('POST', '/v2/ordenes-de-envio', payload);

    return {
      id: randomUUID(),
      courier: this.courier,
      trackingNumber: response.numeroAndreani,
      courierOrderId: response.numeroDeEnvio,
      labelPdfUrl: response.etiqueta?.url,
      estimatedDeliveryAt: response.estimatedDeliveryDate,
      costArs: response.costo?.total,
      status: response.estado ? mapStatus(response.estado) : 'label_created',
    };
  }

  private mapServiceLevel(level: ShipmentDraft['serviceLevel']): string {
    switch (level) {
      case 'same_day': return 'SameDay';
      case 'next_day': return 'NextDay';
      case 'cold_chain': return 'ColdChain';
      case 'standard':
      default: return 'Standard';
    }
  }

  async track(trackingNumber: string, shipmentId: string): Promise<{ status: ShipmentStatus; events: ShipmentEventInput[] }> {
    const response = await this.call<AndreaniTrackResponse>(
      'GET',
      `/v2/ordenes-de-envio/${trackingNumber}/trazas`,
    );

    const events: ShipmentEventInput[] = response.eventos.map((e) => ({
      shipmentId,
      eventType: e.estado,
      eventTime: e.fecha,
      location: e.sucursal,
      description: e.observaciones,
      rawWebhook: e as unknown as Record<string, unknown>,
    }));

    return {
      status: mapStatus(response.estadoActual),
      events,
    };
  }

  async cancel(trackingNumber: string): Promise<void> {
    await this.call<unknown>('DELETE', `/v2/ordenes-de-envio/${trackingNumber}`);
    logger.info(`[AndreaniFarmaAdapter] cancelled ${trackingNumber}`);
  }
}
