import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

export interface DoctorContext {
  userId: string;
  doctorId: string;
}

interface AstroLocals {
  session?: { user?: { id?: string } } | null;
}

export async function resolveDoctorContext(
  request: Request,
  locals?: AstroLocals,
): Promise<DoctorContext | null> {
  try {
    let userId = locals?.session?.user?.id ?? null;

    if (!userId) {
      const supabase = createAstroServerClientFromRequest(request);
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
    }

    if (!userId) {
      return null;
    }

    const admin = createAstroAdminClient();
    const { data: doctor, error } = await admin
      .from('doctors')
      .select('id, active')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('[resolveDoctorContext] Failed to resolve doctor', error);
      return null;
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
