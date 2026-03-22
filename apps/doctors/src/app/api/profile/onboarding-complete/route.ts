import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const supabase = await createRouteHandlerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
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

    // Set onboarding_completed in user_metadata for fast middleware checks
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { onboarding_completed: true },
    });

    if (metaError) {
      logger.error('[API] doctor onboarding-complete user_metadata update failed', metaError);
    }

    // Refresh session
    await supabase.auth.refreshSession();

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[API] doctor onboarding-complete error', err as Error);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
