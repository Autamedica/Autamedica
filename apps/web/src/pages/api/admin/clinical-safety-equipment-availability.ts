import type { APIRoute } from 'astro';
import { createAstroAdminClient } from '@/lib/supabase';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers';
import { createEquipmentSafetyAdapter } from '@/lib/clinical-safety/repos/equipment-safety.repo';
import { checkDeviceAvailabilityUseCase } from '@/lib/clinical-safety/usecases/equipment-lifecycle.usecase';
import { logger } from '@autamedica/shared';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  const url = new URL(request.url);
  const equipmentId = url.searchParams.get('equipmentId');
  if (!equipmentId) return badRequest('equipmentId is required');

  try {
    const admin = createAstroAdminClient(locals.runtime?.env);
    const result = await checkDeviceAvailabilityUseCase(
      {
        supabase: admin,
        equipmentSafetyRepo: createEquipmentSafetyAdapter(admin),
      },
      { equipmentId }
    );

    return jsonOk(result);
  } catch (error) {
    logger.error('[api/admin/clinical-safety-equipment-availability] GET failed', error);
    return internalError(
      'equipment_availability_failed',
      error instanceof Error ? error.message : String(error)
    );
  }
};
