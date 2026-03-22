import { getUserIdFromRequest } from '@/lib/server/auth';
import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  try {
    const userId = await getUserIdFromRequest();
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    const { error: profileError } = await admin
      .from('profiles')
      .update({
        onboarding_completed_at: new Date().toISOString(),
        onboarding_started_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    if (profileError) {
      logger.error('[API] onboarding-complete profile update failed', profileError);
    }

    // Also set onboarding_completed in user_metadata for fast middleware checks
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      user_metadata: { onboarding_completed: true },
    });

    if (authError) {
      logger.error('[API] onboarding-complete user_metadata update failed', authError);
    }

    // Refresh the client session so the metadata is available immediately
    const supabase = await createRouteHandlerClient();
    await supabase.auth.refreshSession();

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[API] onboarding-complete error', err as Error);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
