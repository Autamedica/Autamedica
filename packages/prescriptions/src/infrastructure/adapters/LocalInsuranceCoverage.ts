import type { SupabaseClient } from '@supabase/supabase-js';
import type { IInsuranceCoverageService, CoverageResult } from '../../domain/insurance.ports';
import { logger } from '@autamedica/shared';

const KNOWN_INSURANCE_PROVIDERS = [
  'OSDE',
  'Swiss Medical',
  'Galeno',
  'IOMA',
  'PAMI',
  'Medicus',
  'Accord Salud',
  'OSECAC',
  'OSPRERA',
  'OSPLAD',
  'Unión Personal',
  'Luis Pasteur',
  'Sancor Salud',
  'Federada Salud',
  'OSPIA',
  'OMINT',
  'Hospital Italiano',
  'Medifé',
  'Avalian',
  'Construir Salud',
  'OSDEPYM',
  'Río Uruguay Seguros',
  'Prevención Salud',
] as const;

const MEMBER_NUMBER_PATTERN = /^[A-Z0-9]{4,20}$/i;

export class LocalInsuranceCoverage implements IInsuranceCoverageService {
  constructor(private readonly supabase: SupabaseClient) {}

  async validateCoverage(
    insuranceProvider: string,
    memberNumber: string
  ): Promise<CoverageResult> {
    const noCoverage: CoverageResult = {
      hasCoverage: false,
      requiresAuthorization: false,
    };

    try {
      const isKnownProvider = KNOWN_INSURANCE_PROVIDERS.some(
        (p) => p.toLowerCase() === insuranceProvider.toLowerCase()
      );

      if (!isKnownProvider) {
        logger.warn(`[LocalInsuranceCoverage] Unknown insurance provider: ${insuranceProvider}`);
        return noCoverage;
      }

      if (!MEMBER_NUMBER_PATTERN.test(memberNumber)) {
        logger.warn(`[LocalInsuranceCoverage] Invalid member number format: ${memberNumber}`);
        return noCoverage;
      }

      const { data, error } = await this.supabase
        .from('patients')
        .select('id, insurance_provider, insurance_member_number, insurance_plan')
        .eq('insurance_provider', insuranceProvider)
        .eq('insurance_member_number', memberNumber)
        .maybeSingle();

      if (error) {
        logger.error('[LocalInsuranceCoverage] Supabase query failed', error);
        throw error;
      }

      if (!data) {
        logger.info(`[LocalInsuranceCoverage] No coverage found for ${insuranceProvider} / ${memberNumber}`);
        return noCoverage;
      }

      logger.info(`[LocalInsuranceCoverage] Coverage validated — ${insuranceProvider} / ${memberNumber}`);

      return {
        hasCoverage: true,
        planName: data.insurance_plan ?? undefined,
        coveragePercentage: undefined,
        requiresAuthorization: false,
      };
    } catch (error) {
      logger.error(`[LocalInsuranceCoverage] validateCoverage failed for ${insuranceProvider}`, error);
      throw error;
    }
  }

  async calculateCopay(
    medication: string,
    insuranceProvider: string,
    _memberNumber: string
  ): Promise<{ copayAmount: number; currency: string }> {
    logger.info(
      `[LocalInsuranceCoverage] calculateCopay called for ${medication} / ${insuranceProvider} — ` +
      'returning $0 ARS (real copay calculation requires convenio with obra social)'
    );

    return { copayAmount: 0, currency: 'ARS' };
  }
}
