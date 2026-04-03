import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

export interface DoctorContext {
  userId: string;
  doctorId: string;
}

interface AstroLocals {
  session?: { user?: { id?: string } } | null;
  runtime?: { env?: Record<string, unknown> };
}

export async function resolveDoctorContext(
  request: Request,
  locals?: AstroLocals,
): Promise<DoctorContext | null> {
  try {
    let userId = locals?.session?.user?.id ?? null;

    if (!userId) {
      const supabase = createAstroServerClientFromRequest(request, locals?.runtime?.env);
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }

    if (!userId) {
      return null;
    }

    const admin = createAstroAdminClient(locals?.runtime?.env);
    let { data: doctor, error } = await admin
      .from('doctors')
      .select('id, active')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('[resolveDoctorContext] Failed to resolve doctor', error);
      return null;
    }

    // Self-healing: if doctor row doesn't exist yet, create it automatically
    // just like we do for patients. This prevents 401s during the onboarding grace period
    // when the user has the 'doctor' role but hasn't completed their profile yet.
    if (!doctor) {
      logger.info('[resolveDoctorContext] Doctor row not found, creating one for userId:', userId);
      const { data: insertedDoctor, error: insertError } = await admin
        .from('doctors')
        .upsert(
          { 
            user_id: userId, 
            active: true,
            // Provide minimal required defaults to satisfy DB constraints
            license_number: 'PENDING',
            specialty: 'General'
          }, 
          { onConflict: 'user_id' }
        )
        .select('id, active')
        .maybeSingle();

      if (insertError) {
        logger.error('[resolveDoctorContext] Failed to auto-create doctor row', insertError);
        return null;
      }
      doctor = insertedDoctor;
    }

    if (!doctor?.id || doctor.active !== true) {
      return null;
    }

    return { userId, doctorId: doctor.id };
  } catch (error) {
    logger.error('[resolveDoctorContext] Unhandled error', error);
    return null;
  }
}
