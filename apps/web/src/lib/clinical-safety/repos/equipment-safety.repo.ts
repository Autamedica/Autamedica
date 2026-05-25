import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  MedicalEquipment,
  EquipmentIncident,
  EquipmentEvent,
  IEquipmentSafetyRepository,
} from '@autamedica/types';
import { logger } from '@autamedica/shared';

type Db = SupabaseClient<Database>;

export function createEquipmentSafetyAdapter(supabase: Db): IEquipmentSafetyRepository {
  return {
    async getEquipmentById(id: string): Promise<MedicalEquipment | null> {
      const { data, error } = await supabase
        .from('medical_equipment')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (error) {
        logger.error('[equipmentSafetyRepo] getEquipmentById failed', error);
        throw error;
      }
      return data;
    },

    async getEquipmentBySerialNumber(serialNumber: string): Promise<MedicalEquipment | null> {
      const { data, error } = await supabase
        .from('medical_equipment')
        .select('*')
        .eq('serial_number', serialNumber)
        .maybeSingle();

      if (error) {
        logger.error('[equipmentSafetyRepo] getEquipmentBySerialNumber failed', error);
        throw error;
      }
      return data;
    },

    async updateEquipmentStatus(
      id: string,
      status: MedicalEquipment['current_status'],
      calibration?: {
        lastCalibratedAt: string;
        nextCalibrationDue: string;
      }
    ): Promise<MedicalEquipment> {
      const updatePayload: Database['public']['Tables']['medical_equipment']['Update'] = {
        current_status: status,
      };

      if (calibration) {
        updatePayload.last_calibrated_at = calibration.lastCalibratedAt;
        updatePayload.next_calibration_due = calibration.nextCalibrationDue;
      }

      const { data, error } = await supabase
        .from('medical_equipment')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        logger.error('[equipmentSafetyRepo] updateEquipmentStatus failed', error);
        throw error;
      }
      return data;
    },

    async createEquipmentIncident(
      incident: Omit<EquipmentIncident, 'id' | 'reported_at'>
    ): Promise<EquipmentIncident> {
      const { data, error } = await supabase
        .from('equipment_incidents')
        .insert({
          ...incident,
          status: 'open',
        })
        .select('*')
        .single();

      if (error) {
        logger.error('[equipmentSafetyRepo] createEquipmentIncident failed', error);
        throw error;
      }
      return data;
    },

    async getOpenIncidentForEquipment(equipmentId: string): Promise<EquipmentIncident | null> {
      const { data, error } = await supabase
        .from('equipment_incidents')
        .select('*')
        .eq('equipment_id', equipmentId)
        .eq('status', 'open')
        .order('reported_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error('[equipmentSafetyRepo] getOpenIncidentForEquipment failed', error);
        throw error;
      }
      return data;
    },

    async resolveIncident(
      incidentId: string,
      updates: Partial<EquipmentIncident>
    ): Promise<EquipmentIncident> {
      const { data, error } = await supabase
        .from('equipment_incidents')
        .update({
          ...updates,
          resolved_at: new Date().toISOString(),
          closed_at: new Date().toISOString(),
        })
        .eq('id', incidentId)
        .select('*')
        .single();

      if (error) {
        logger.error('[equipmentSafetyRepo] resolveIncident failed', error);
        throw error;
      }
      return data;
    },

    async logEquipmentEvent(event: Omit<EquipmentEvent, 'id' | 'timestamp'>): Promise<EquipmentEvent> {
      const { data, error } = await supabase
        .from('equipment_events')
        .insert(event)
        .select('*')
        .single();

      if (error) {
        logger.error('[equipmentSafetyRepo] logEquipmentEvent failed', error);
        throw error;
      }
      return data;
    },

    async getEventsForIncident(incidentId: string): Promise<EquipmentEvent[]> {
      const { data, error } = await supabase
        .from('equipment_events')
        .select('*')
        .eq('incident_id', incidentId)
        .order('timestamp', { ascending: true });

      if (error) {
        logger.error('[equipmentSafetyRepo] getEventsForIncident failed', error);
        throw error;
      }
      return data ?? [];
    },
  };
}
