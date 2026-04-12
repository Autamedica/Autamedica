import type { SupabaseClient } from '@supabase/supabase-js';
import type { PharmacyId } from '../../domain/pharmacy.models';
import type { IPharmacyConventionService, ConventionStatus } from '../../domain/pharmacy-convention.ports';
import { logger } from '@autamedica/shared';

export class LocalPharmacyConvention implements IPharmacyConventionService {
  constructor(private readonly supabase: SupabaseClient) {}

  async validatePharmacyLicense(licenseNumber: string, province: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('pharmacies')
        .select('id, active')
        .eq('license_number', licenseNumber)
        .maybeSingle();

      if (error) {
        logger.error('[LocalPharmacyConvention] Failed to query pharmacy license', error);
        throw error;
      }

      if (!data) {
        logger.info(`[LocalPharmacyConvention] Pharmacy license not found: ${licenseNumber} (${province})`);
        return false;
      }

      const isValid = data.active === true;
      logger.info(`[LocalPharmacyConvention] License ${licenseNumber} — active=${isValid}`);
      return isValid;
    } catch (error) {
      logger.error(`[LocalPharmacyConvention] validatePharmacyLicense failed for ${licenseNumber}`, error);
      throw error;
    }
  }

  async checkConventionStatus(pharmacyId: PharmacyId): Promise<ConventionStatus> {
    try {
      const { data, error } = await this.supabase
        .from('pharmacies')
        .select('id, active')
        .eq('id', pharmacyId)
        .maybeSingle();

      if (error) {
        logger.error('[LocalPharmacyConvention] Failed to check convention status', error);
        throw error;
      }

      if (!data) {
        logger.info(`[LocalPharmacyConvention] Pharmacy not found: ${pharmacyId}`);
        return { isActive: false, conventionType: 'none' };
      }

      logger.info(`[LocalPharmacyConvention] Convention status for ${pharmacyId}: active=direct`);
      return { isActive: true, conventionType: 'direct' };
    } catch (error) {
      logger.error(`[LocalPharmacyConvention] checkConventionStatus failed for ${pharmacyId}`, error);
      throw error;
    }
  }
}
