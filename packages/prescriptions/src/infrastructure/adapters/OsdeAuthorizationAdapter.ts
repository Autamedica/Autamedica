/**
 * OsdeAuthorizationAdapter — solicita autorización de cobertura a OSDE.
 *
 * Endpoints (OSDE Prestadores / Validador de Prácticas):
 *   POST /validador/v1/autorizaciones  → request
 *   GET  /validador/v1/autorizaciones/:id  → status
 *   DEL  /validador/v1/autorizaciones/:id  → cancel
 */

import type {
  IInsuranceAuthorizationService,
  AuthorizationRequest,
  AuthorizationResult,
  AuthorizationStatus,
} from '../../domain/insurance-authorization.ports';
import { logger } from '@autamedica/shared';

export interface OsdeConfig {
  baseUrl: string;
  apiKey: string;
  prestadorCuit: string;
  requestTimeoutMs?: number;
}

interface OsdeAuthResponse {
  numeroAutorizacion?: string;
  estado: string;
  porcentajeCobertura?: number;
  montoAprobado?: number;
  montoACargoAsociado?: number;
  motivoRechazo?: string;
  vigenciaHasta?: string;
}

const STATUS_MAP: Record<string, AuthorizationStatus> = {
  APROBADA: 'approved',
  APROBADO: 'approved',
  AUTORIZADA: 'approved',
  RECHAZADA: 'denied',
  RECHAZADO: 'denied',
  PENDIENTE: 'pending_review',
  EN_REVISION: 'pending_review',
  VENCIDA: 'expired',
  CANCELADA: 'cancelled',
};

function mapStatus(raw: string): AuthorizationStatus {
  return STATUS_MAP[raw.toUpperCase().replace(/\s+/g, '_')] ?? 'pending_review';
}

export class OsdeAuthorizationAdapter implements IInsuranceAuthorizationService {
  readonly provider = 'osde' as const;

  constructor(private readonly config: OsdeConfig) {
    if (!config.apiKey) throw new Error('OSDE apiKey required');
    if (!config.prestadorCuit) throw new Error('OSDE prestadorCuit required');
  }

  private async call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const url = `${this.config.baseUrl.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'X-Prestador-CUIT': this.config.prestadorCuit,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs ?? 15_000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OSDE ${res.status}: ${text.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }

  async requestAuthorization(request: AuthorizationRequest): Promise<AuthorizationResult> {
    const payload = {
      nroAfiliado: request.memberNumber,
      planCodigo: request.planCode,
      documentoPaciente: request.patientDni,
      nombrePaciente: request.patientFullName,
      prescriptor: { matricula: request.prescriberMatricula },
      diagnosticoCie10: request.diagnosisCie10,
      medicamentos: request.drugs.map((d) => ({
        nombreGenerico: d.genericName,
        nombreComercial: d.commercialName,
        cantidad: d.quantity,
        precioUnitario: d.unitPriceArs,
      })),
      prescriptionId: request.prescriptionId,
    };

    logger.info(`[OsdeAuthorizationAdapter] request auth prescription=${request.prescriptionId} member=${request.memberNumber}`);
    const response = await this.call<OsdeAuthResponse>('POST', '/validador/v1/autorizaciones', payload);

    return {
      status: mapStatus(response.estado),
      authorizationNumber: response.numeroAutorizacion,
      coveragePct: response.porcentajeCobertura,
      approvedAmountArs: response.montoAprobado,
      outOfPocketArs: response.montoACargoAsociado,
      denialReason: response.motivoRechazo,
      expiresAt: response.vigenciaHasta,
      rawResponse: response as unknown as Record<string, unknown>,
    };
  }

  async checkStatus(authorizationNumber: string): Promise<AuthorizationResult> {
    const response = await this.call<OsdeAuthResponse>('GET', `/validador/v1/autorizaciones/${authorizationNumber}`);
    return {
      status: mapStatus(response.estado),
      authorizationNumber: response.numeroAutorizacion,
      coveragePct: response.porcentajeCobertura,
      approvedAmountArs: response.montoAprobado,
      outOfPocketArs: response.montoACargoAsociado,
      denialReason: response.motivoRechazo,
      expiresAt: response.vigenciaHasta,
      rawResponse: response as unknown as Record<string, unknown>,
    };
  }

  async cancel(authorizationNumber: string): Promise<void> {
    await this.call<unknown>('DELETE', `/validador/v1/autorizaciones/${authorizationNumber}`);
    logger.info(`[OsdeAuthorizationAdapter] cancelled auth=${authorizationNumber}`);
  }
}
