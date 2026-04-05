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

function extractRole(metadata: Record<string, unknown> | undefined): string | undefined {
  const raw = metadata?.role;
  return typeof raw === 'string' ? raw : undefined;
}

export async function resolveDoctorContext(
  request: Request,
  locals?: AstroLocals,
): Promise<DoctorContext | null> {
  try {
    let userId = locals?.session?.user?.id ?? null;
    let userRole = extractRole(locals?.session?.user?.app_metadata as Record<string, unknown> | undefined)
      ?? extractRole(locals?.session?.user?.user_metadata);

    if (!userId) {
      const supabase = createAstroServerClientFromRequest(request, locals?.runtime?.env);
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!userRole && data.user) {
        userRole = extractRole(data.user.app_metadata as Record<string, unknown>)
          ?? extractRole(data.user.user_metadata as Record<string, unknown>);
      }
    }

    if (!userId) {
      return null;
    }

    if (!userRole || !DOCTOR_ALLOWED_ROLES.has(userRole)) {
      logger.info('[resolveDoctorContext] User role does not grant doctor access', {
        userId,
        role: userRole ?? 'none',
      });
      return null;
    }

    const admin = createAstroAdminClient(locals?.runtime?.env);
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
