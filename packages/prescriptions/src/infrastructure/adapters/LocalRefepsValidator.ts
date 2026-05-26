import type { SupabaseClient } from '@supabase/supabase-js';
import type { IRefepsValidator, RefepsValidationResult } from '../../domain/refeps.ports';
import { logger } from '@autamedica/shared';

const VALID_PROVINCES = [
  'CABA', 'Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja',
  'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta', 'San Juan',
  'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero',
  'Tierra del Fuego', 'Tucumán',
];

const MN_PATTERN = /^\d{4,6}$/;

export class LocalRefepsValidator implements IRefepsValidator {
  constructor(private readonly supabase: SupabaseClient) {}

  async validateMatricula(
    matricula: string,
    type: 'MN' | 'MP',
    province?: string
  ): Promise<RefepsValidationResult> {
    const baseResult: RefepsValidationResult = {
      isValid: false,
      matriculaNumber: matricula,
      matriculaType: type,
      registrationStatus: 'not_found',
    };

    try {
      if (type === 'MN' && !MN_PATTERN.test(matricula)) {
        logger.warn(`[LocalRefepsValidator] Invalid MN format: ${matricula} (expected 4-6 digits)`);
        return baseResult;
      }

      if (type === 'MP') {
        if (!province) {
          logger.warn(`[LocalRefepsValidator] MP matrícula requires province — matricula=${matricula}`);
          return baseResult;
        }
        if (!VALID_PROVINCES.includes(province)) {
          logger.warn(`[LocalRefepsValidator] Invalid province for MP: ${province}`);
          return baseResult;
        }
      }

      const { data, error } = await this.supabase
        .from('doctors')
        .select(`
          id,
          specialty,
          license_number,
          enrollment_jurisdiction,
          active,
          user_id,
          profiles (
            first_name,
            last_name
          )
        `)
        .eq('license_number', matricula)
        .maybeSingle();

      if (error) {
        logger.error('[LocalRefepsValidator] Supabase query failed', error);
        throw error;
      }

      if (!data) {
        logger.info(`[LocalRefepsValidator] Matrícula not found in DB: ${type} ${matricula}`);
        return baseResult;
      }

      const registrationStatus = data.active ? 'active' as const : 'suspended' as const;

      logger.info(`[LocalRefepsValidator] Matrícula validated — ${type} ${matricula} → ${registrationStatus}`);

      const profile = data.profiles as { first_name: string | null; last_name: string | null } | null;
      const resolvedFullName = profile
        ? `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
        : '';

      return {
        isValid: data.active === true,
        matriculaNumber: matricula,
        matriculaType: type,
        fullName: resolvedFullName,
        specialty: data.specialty,
        province: data.enrollment_jurisdiction ?? province,
        registrationStatus,
      };
    } catch (error) {
      logger.error(`[LocalRefepsValidator] Failed to validate matrícula ${type} ${matricula}`, error);
      throw error;
    }
  }
}
