import type { SupabaseClient } from '@supabase/supabase-js';
import type { IIdentityValidator } from '../../domain/ports';
import { logger } from '@autamedica/shared';

export class SupabaseIdentityValidator implements IIdentityValidator {
  constructor(private readonly supabase: SupabaseClient) {}

  async validateDoctor(doctorId: string): Promise<{ active: boolean; matricula: string }> {
    const { data, error } = await this.supabase
      .from('doctors')
      .select('active, license_number')
      .eq('user_id', doctorId)
      .single();
    if (error) {
      logger.error('[IdentityValidator] Failed to validate doctor', error);
      throw error;
    }
    if (!data) {
      logger.error('[IdentityValidator] Doctor not found', { doctorId });
      throw new Error(`Doctor not found: ${doctorId}`);
    }
    return {
      active: data.active as boolean,
      matricula: data.license_number as string,
    };
  }

  async validatePatient(cuil: string): Promise<{ isValid: boolean; fullName: string }> {
    const { data, error } = await this.supabase
      .from('patients')
      .select('full_name')
      .eq('cuil', cuil)
      .single();
    if (error) {
      if (error.code === 'PGRST116') {
        return { isValid: false, fullName: '' };
      }
      logger.error('[IdentityValidator] Failed to validate patient', error);
      throw error;
    }
    if (!data) {
      return { isValid: false, fullName: '' };
    }
    return {
      isValid: true,
      fullName: data.full_name as string,
    };
  }
}
