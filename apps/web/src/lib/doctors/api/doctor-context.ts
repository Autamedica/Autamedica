import { createAstroAdminClient, createAstroServerClientFromRequest } from '@/lib/supabase';
import { logger } from '@autamedica/shared';

export interface DoctorContext {
  userId: string;
  doctorId: string;
}

interface AstroLocals {
  session?: {
    user?: {
      id?: string;
      user_metadata?: Record<string, unknown>;
      app_metadata?: Record<string, unknown>;
    }
  } | null;
  runtime?: { env?: Record<string, unknown> };
}

const DOCTOR_ALLOWED_ROLES = new Set(['doctor', 'organization_admin', 'platform_admin', 'admin']);

export async function resolveDoctorContext(
  request: Request,
  locals?: AstroLocals,
): Promise<DoctorContext | null> {
  try {
    let userId = locals?.session?.user?.id ?? null;

    if (!userId) {
      const supabase = createAstroServerClientFromRequest(request, locals?.runtime?.env);
      const { data, error } = await supabase.auth.getUser();
      if (error) return null;
      userId = data.user?.id ?? null;
    }

    if (!userId) return null;

    const admin = createAstroAdminClient(locals?.runtime?.env);
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    const userRole = profile?.role;

    if (profileError || !userRole || !DOCTOR_ALLOWED_ROLES.has(userRole)) {
      logger.info('[resolveDoctorContext] User role does not grant doctor access', {
        userId,
        role: userRole ?? 'none',
      });
      return null;
    }

    const { data: doctor, error } = await admin
      .from('doctors')
      .select('id, active')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      logger.error('[resolveDoctorContext] Failed to resolve doctor', error);
      return null;
    }

    if (!doctor) {
      logger.info('[resolveDoctorContext] No doctor record found — doctor must complete onboarding first', {
        userId,
      });
      return null;
    }

    if (!doctor.id || doctor.active !== true) {
      return null;
    }

    return { userId, doctorId: doctor.id };
  } catch (error) {
    logger.error('[resolveDoctorContext] Unhandled error', error);
    return null;
  }
}
