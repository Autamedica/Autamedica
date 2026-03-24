import type { APIRoute } from 'astro';
import { createServerClientFromRequest, createAdminClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { jsonOk, unauthorized, internalError } from '@/lib/api-helpers';

export const POST: APIRoute = async ({ request }) => {
  try {
    const supabase = createServerClientFromRequest(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return unauthorized();
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const firstName = typeof body?.first_name === 'string' ? body.first_name.trim() : null;
    const lastName = typeof body?.last_name === 'string' ? body.last_name.trim() : null;

    const admin = createAdminClient();

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        onboarding_completed_at: new Date().toISOString(),
        onboarding_started_at: new Date().toISOString(),
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
      })
      .eq('user_id', user.id);

    if (profileError) {
      logger.error('[API] doctor onboarding-complete profile update failed', profileError);
    }

    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { onboarding_completed: true },
    });

    if (metaError) {
      logger.error('[API] doctor onboarding-complete user_metadata update failed', metaError);
    }

    return jsonOk(null);
  } catch (err) {
    logger.error('[API] doctor onboarding-complete error', err as Error);
    return internalError();
  }
};
