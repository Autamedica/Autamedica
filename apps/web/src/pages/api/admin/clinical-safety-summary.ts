import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { internalError, jsonOk } from '@/lib/api-helpers';
import { logger } from '@autamedica/shared';

export const prerender = false;

async function countRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any
): Promise<number> {
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

type EquipmentRiskRow = {
  id: string;
  serial_number: string;
  brand: string;
  model_name: string;
  device_type: string;
  current_status: string;
  current_setting: string;
  next_calibration_due: string;
};

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const now = new Date().toISOString();

    const [
      openClinicalIncidents,
      escalatedClinicalIncidents,
      breachedClinicalSla,
      pendingOutboxEvents,
      failedOutboxEvents,
      activeEquipment,
      unavailableEquipment,
      expiredCalibration,
      openEquipmentIncidents,
    ] = await Promise.all([
      countRows(admin.from('clinical_incidents').select('id', { count: 'exact', head: true }).eq('status', 'open')),
      countRows(admin.from('clinical_incidents').select('id', { count: 'exact', head: true }).eq('status', 'escalated')),
      countRows(admin.from('clinical_incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'escalated']).lt('sla_deadline', now)),
      countRows(admin.from('clinical_outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      countRows(admin.from('clinical_outbox_events').select('id', { count: 'exact', head: true }).eq('status', 'failed')),
      countRows(admin.from('medical_equipment').select('id', { count: 'exact', head: true }).eq('current_status', 'active')),
      countRows(admin.from('medical_equipment').select('id', { count: 'exact', head: true }).neq('current_status', 'active')),
      countRows(admin.from('medical_equipment').select('id', { count: 'exact', head: true }).lte('next_calibration_due', now)),
      countRows(admin.from('equipment_incidents').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress'])),
    ]);

    const [
      { data: recentClinicalIncidents, error: clinicalError },
      { data: unavailableEquipmentRows, error: unavailableRowsError },
      { data: expiredEquipmentRows, error: expiredRowsError },
    ] =
      await Promise.all([
        admin
          .from('clinical_incidents')
          .select('id, condition_display, setting, severity, status, sla_deadline, created_at')
          .in('status', ['open', 'escalated'])
          .order('sla_deadline', { ascending: true })
          .limit(8),
        admin
          .from('medical_equipment')
          .select('id, serial_number, brand, model_name, device_type, current_status, current_setting, next_calibration_due')
          .neq('current_status', 'active')
          .order('next_calibration_due', { ascending: true })
          .limit(8),
        admin
          .from('medical_equipment')
          .select('id, serial_number, brand, model_name, device_type, current_status, current_setting, next_calibration_due')
          .lte('next_calibration_due', now)
          .order('next_calibration_due', { ascending: true })
          .limit(8),
      ]);

    if (clinicalError) throw clinicalError;
    if (unavailableRowsError) throw unavailableRowsError;
    if (expiredRowsError) throw expiredRowsError;

    const equipmentAtRisk = Array.from(
      new Map(
        [...(unavailableEquipmentRows ?? []), ...(expiredEquipmentRows ?? [])]
          .sort((a, b) => a.next_calibration_due.localeCompare(b.next_calibration_due))
          .slice(0, 8)
          .map((equipment) => [equipment.id, equipment])
      ).values()
    ) as EquipmentRiskRow[];

    return jsonOk({
      generatedAt: now,
      clinical: {
        open: openClinicalIncidents,
        escalated: escalatedClinicalIncidents,
        slaBreached: breachedClinicalSla,
        recent: recentClinicalIncidents ?? [],
      },
      outbox: {
        pending: pendingOutboxEvents,
        failed: failedOutboxEvents,
      },
      equipment: {
        active: activeEquipment,
        unavailable: unavailableEquipment,
        expiredCalibration,
        openIncidents: openEquipmentIncidents,
        atRisk: equipmentAtRisk,
      },
    });
  } catch (error) {
    logger.error('[api/admin/clinical-safety-summary] GET failed', error);
    return internalError(
      'clinical_safety_summary_failed',
      error instanceof Error ? error.message : String(error)
    );
  }
};
