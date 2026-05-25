import type { APIRoute } from 'astro';
import { z } from 'zod';
import { createAstroAdminClient } from '@/lib/supabase';
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth';
import { badRequest, internalError, jsonOk } from '@/lib/api-helpers';
import { createEquipmentSafetyAdapter } from '@/lib/clinical-safety/repos/equipment-safety.repo';
import { updateEquipmentStatusUseCase } from '@/lib/clinical-safety/usecases/equipment-lifecycle.usecase';
import { logger } from '@autamedica/shared';

export const prerender = false;

const UpdateEquipmentStatusSchema = z.object({
  equipmentId: z.string().uuid(),
  targetStatus: z.enum([
    'active',
    'review_required',
    'under_maintenance',
    'validation_pending',
    'decommissioned',
  ]),
  notes: z.string().trim().min(3).max(2000),
  calibrationCertificateUrl: z.string().url().optional(),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, ADMIN_ROLES, locals);
  if (!isAuthed(auth)) return auth;

  try {
    const parsed = UpdateEquipmentStatusSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest(parsed.error.message);

    const admin = createAstroAdminClient(locals.runtime?.env);
    const result = await updateEquipmentStatusUseCase(
      {
        supabase: admin,
        equipmentSafetyRepo: createEquipmentSafetyAdapter(admin),
      },
      {
        equipmentId: parsed.data.equipmentId,
        targetStatus: parsed.data.targetStatus,
        actorId: auth.user.id,
        notes: parsed.data.notes,
        calibrationCertificateUrl: parsed.data.calibrationCertificateUrl,
      }
    );

    return jsonOk(result);
  } catch (error) {
    logger.error('[api/admin/clinical-safety-equipment-status] POST failed', error);

    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('certificado de calibración')) {
      return badRequest(message);
    }

    return internalError('equipment_status_update_failed', message);
  }
};
