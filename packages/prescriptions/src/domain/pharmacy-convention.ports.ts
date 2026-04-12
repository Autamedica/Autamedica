import type { PharmacyId } from './pharmacy.models';

export interface ConventionStatus {
  isActive: boolean;
  conventionType: 'direct' | 'network' | 'none';
  validUntil?: string;
}

export interface IPharmacyConventionService {
  validatePharmacyLicense(licenseNumber: string, province: string): Promise<boolean>;
  checkConventionStatus(pharmacyId: PharmacyId): Promise<ConventionStatus>;
}
