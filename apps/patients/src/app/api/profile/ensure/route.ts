import { createAdminClient, createRouteHandlerClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const supabase = await createRouteHandlerClient();

    // Try auth via Authorization: Bearer <token> header first (works in dev across ports)
    const headerList = await headers();
    const authHeader = headerList.get('authorization');
    let userId: string | null = null;

    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7);
      try {
        const admin = createAdminClient();
        const { data: userRes, error: userErr } = await admin.auth.getUser(token);
        if (!userErr && userRes?.user) userId = userRes.user.id;
      } catch { void 0 }
    }

    if (!userId) {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (!userErr && userData.user) {
        userId = userData.user.id;
      }
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const email = body?.email;
    const admin = createAdminClient();

    // Ensure profiles row exists with the production schema
    try {
      const { error: profileErr } = await admin
        .from('profiles')
        .upsert({
          user_id: userId,
          email: typeof email === 'string' && email.length > 0 ? email : null,
          external_id: userId,
          role: 'patient',
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (profileErr) {
        throw profileErr;
      }
    } catch (e) {
      logger.error('[API] ensure profile failed (profiles)', e as Error);
      return NextResponse.json({ ok: false, error: 'profiles_failed' }, { status: 400 });
    }

    // Optionally ensure patients row exists
    try {
      const { error: patientErr } = await admin
        .from('patients')
        .upsert({
          user_id: userId,
          active: true,
        }, { onConflict: 'user_id' })
        .select()
        .single();

      if (patientErr) {
        throw patientErr;
      }
    } catch {
      // ignore if table or constraint is different in this instance
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error('[API] profile ensure error', err as Error);
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
