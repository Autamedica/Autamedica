/**
 * POST /api/admin/renpre/upload
 * Admin-only: carga / actualiza el registro RENPRE de un médico.
 * Body: { doctorId, renpreNumber, validFrom, validUntil, certificatePdfUrl? }
 */
import type { APIRoute } from 'astro';
import { logger } from '@autamedica/shared';
import { SupabaseRenpreValidator } from '@autamedica/prescriptions';
import type { DoctorId } from '@autamedica/types';
import { createAstroAdminClient } from '@/lib/supabase';
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers';

const ADMIN_ROLES = ['admin', 'platform_admin', 'organization_admin'] as const;
type AdminRole = (typeof ADMIN_ROLES)[number];

function isAdminRole(role: unknown): role is AdminRole {
  return typeof role === 'string' && (ADMIN_ROLES as readonly string[]).includes(role);
}

type ProfileRoleRow = { role?: string | null };
type ProfileRoleClient = {
  from(table: 'profiles'): {
    select(columns: 'role'): {
      eq(column: 'user_id', value: string): {
        maybeSingle(): Promise<{ data: ProfileRoleRow | null }>;
      };
    };
  };
};

async function assertAdmin(request: Request, admin: ReturnType<typeof createAstroAdminClient>): Promise<{ ok: boolean; userId?: string }> {
  const authHeader = request.headers.get('authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return { ok: false };
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false };

  const profileClient = admin as unknown as ProfileRoleClient;
  const { data: profile } = await profileClient
    .from('profiles')
    .select('role')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (!isAdminRole(profile?.role)) return { ok: false };
  return { ok: true, userId: data.user.id };
}

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env);
  const auth = await assertAdmin(request, admin);
  if (!auth.ok) return unauthorized('admin role required');

  let body: { doctorId?: string; renpreNumber?: string; validFrom?: string; validUntil?: string; certificatePdfUrl?: string };
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid JSON');
  }

  if (!body.doctorId || !body.renpreNumber || !body.validFrom || !body.validUntil) {
    return badRequest('doctorId, renpreNumber, validFrom, validUntil required');
  }

  try {
    const validator = new SupabaseRenpreValidator(admin);
    const result = await validator.upsert({
      doctorId: body.doctorId as DoctorId,
      renpreNumber: body.renpreNumber,
      validFrom: body.validFrom,
      validUntil: body.validUntil,
      certificatePdfUrl: body.certificatePdfUrl,
    });
    logger.info(`[admin/renpre/upload] registered doctor=${body.doctorId} number=${body.renpreNumber}`);
    return jsonOk({ registration: result });
  } catch (err) {
    logger.error('[admin/renpre/upload] failed', err);
    return internalError(err instanceof Error ? err.message : 'upload failed');
  }
};
