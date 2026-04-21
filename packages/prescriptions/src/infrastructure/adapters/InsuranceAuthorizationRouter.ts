import type {
  IInsuranceAuthorizationRouter,
  IInsuranceAuthorizationService,
  AuthorizationRequest,
  AuthorizationResult,
  InsuranceProvider,
} from '../../domain/insurance-authorization.ports';
import { logger } from '@autamedica/shared';

/**
 * Enruta solicitudes de autorización al adapter correcto según la obra social del paciente.
 * Para provider 'particular' devuelve 100% a cargo del paciente (no hay adapter).
 * Para providers sin adapter registrado, retorna 'pending_review' para evaluación manual.
 */
export class InsuranceAuthorizationRouter implements IInsuranceAuthorizationRouter {
  private adapters = new Map<InsuranceProvider, IInsuranceAuthorizationService>();

  register(adapter: IInsuranceAuthorizationService): this {
    this.adapters.set(adapter.provider, adapter);
    return this;
  }

  async dispatch(request: AuthorizationRequest): Promise<AuthorizationResult> {
    if (request.insuranceProvider === 'particular') {
      const total = request.drugs.reduce((acc, d) => acc + (d.unitPriceArs ?? 0) * d.quantity, 0);
      return {
        status: 'approved',
        authorizationNumber: `PARTICULAR-${Date.now()}`,
        coveragePct: 0,
        approvedAmountArs: 0,
        outOfPocketArs: total,
      };
    }

    const adapter = this.adapters.get(request.insuranceProvider);
    if (!adapter) {
      logger.warn(`[InsuranceAuthorizationRouter] no adapter for ${request.insuranceProvider}, queued for manual review`);
      return {
        status: 'pending_review',
        denialReason: `provider ${request.insuranceProvider} not integrated, manual review required`,
      };
    }

    return await adapter.requestAuthorization(request);
  }
}
