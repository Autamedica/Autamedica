import type { IRefepsValidator, RefepsValidationResult } from '../../domain/refeps.ports';
import { logger } from '@autamedica/shared';

export class RefepsApiValidator implements IRefepsValidator {
  constructor(
    private readonly _apiKey: string,
    private readonly _baseUrl: string
  ) {}

  async validateMatricula(
    matricula: string,
    type: 'MN' | 'MP',
    _province?: string
  ): Promise<RefepsValidationResult> {
    // TODO(blocked): requiere convenio con REFEPS del Ministerio de Salud
    logger.warn(
      `[RefepsApiValidator] REFEPS API not available — returning not_found for ${type} ${matricula}. ` +
      'Integration requires signed agreement with Ministerio de Salud de la Nación.'
    );

    return {
      isValid: false,
      matriculaNumber: matricula,
      matriculaType: type,
      registrationStatus: 'not_found',
    };
  }
}
