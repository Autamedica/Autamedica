import type { SupabaseClient } from '@supabase/supabase-js';
import type { ISODateString } from '../../domain/models';
import type {
  IPharmacyRegistry,
  Pharmacy,
  PharmacyId,
  Pharmacist,
} from '../../domain/pharmacy.ports';
import { logger } from '@autamedica/shared';

const iso = (s: string) => s as unknown as ISODateString;

function mapPharmacy(row: Record<string, unknown>): Pharmacy {
  const address = (row.address ?? {}) as Record<string, unknown>;
  return {
    id: row.id as PharmacyId,
    name: row.name as string,
    licenseNumber: row.license_number as string,
    address: {
      street: address.street as string | undefined,
      city: address.city as string | undefined,
      province: address.province as string | undefined,
      zip: address.zip as string | undefined,
      lat: address.lat as number | undefined,
      lng: address.lng as number | undefined,
    },
    phone: row.phone as string | undefined,
    email: row.email as string | undefined,
    active: row.active as boolean,
    organizationId: row.organization_id as string | undefined,
    createdAt: iso(row.created_at as string),
    updatedAt: iso(row.updated_at as string),
  };
}

function mapPharmacist(row: Record<string, unknown>): Pharmacist {
  return {
    id: row.id as Pharmacist['id'],
    userId: row.user_id as string,
    pharmacyId: row.pharmacy_id as PharmacyId,
    licenseNumber: row.license_number as string,
    licenseProvince: row.license_province as string,
    fullName: row.full_name as string,
    role: row.role as Pharmacist['role'],
    active: row.active as boolean,
    createdAt: iso(row.created_at as string),
    updatedAt: iso(row.updated_at as string),
  };
}

export class SupabasePharmacyRegistry implements IPharmacyRegistry {
  constructor(private readonly supabase: SupabaseClient) {}

  async findPharmacyById(id: PharmacyId): Promise<Pharmacy | null> {
    const { data, error } = await this.supabase
      .from('pharmacies')
      .select('*')
      .eq('id', id)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('[PharmacyRegistry] Failed to find pharmacy by id', error);
      throw error;
    }
    if (!data) return null;
    return mapPharmacy(data as Record<string, unknown>);
  }

  async findPharmacistByUserId(userId: string): Promise<Pharmacist | null> {
    const { data, error } = await this.supabase
      .from('pharmacists')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      logger.error('[PharmacyRegistry] Failed to find pharmacist by user id', error);
      throw error;
    }
    if (!data) return null;
    return mapPharmacist(data as Record<string, unknown>);
  }

  async findPharmacistsByPharmacy(pharmacyId: PharmacyId): Promise<Pharmacist[]> {
    const { data, error } = await this.supabase
      .from('pharmacists')
      .select('*')
      .eq('pharmacy_id', pharmacyId)
      .order('full_name', { ascending: true });
    if (error) {
      logger.error('[PharmacyRegistry] Failed to find pharmacists by pharmacy', error);
      throw error;
    }
    return (data as Record<string, unknown>[]).map(mapPharmacist);
  }

  async getPharmacyForUser(userId: string): Promise<Pharmacy | null> {
    const pharmacist = await this.findPharmacistByUserId(userId);
    if (!pharmacist) return null;
    return this.findPharmacyById(pharmacist.pharmacyId);
  }
}
