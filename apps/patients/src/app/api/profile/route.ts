import { buildPatientContext, persistPatientContextFiles } from '@/lib/ai/context-builder';
import { getUserIdFromRequest } from '@/lib/server/auth';
import { buildPatientUpdatePayload } from '@/lib/zod/patients';
import { buildProfileUpdatePayload } from '@/lib/zod/profiles';
import { createAdminClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Utility removed as it's now imported from @/lib/server/auth

export async function PATCH(request: Request) {
  try {
    const userId = await getUserIdFromRequest();
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { profile, patient } = body ?? {};

    const admin = createAdminClient();

    let updatedProfile: unknown = null;
    let updatedPatient: unknown = null;

    // Update profiles
    if (profile) {
      const snake = buildProfileUpdatePayload(profile);
      try {
        const upd = await admin
          .from('profiles')
          .update(snake)
          .eq('user_id', userId)
          .select('*')
          .maybeSingle();

        if (upd.error && upd.error.code !== 'PGRST116') {
          throw upd.error;
        }

        if (upd.data) {
          updatedProfile = upd.data;
        } else {
          const ins = await admin
            .from('profiles')
            .insert({ user_id: userId, external_id: userId, role: 'patient', ...snake })
            .select('*')
            .single();

          if (ins.error) {
            throw ins.error;
          }

          updatedProfile = ins.data;
        }
      } catch (profileError: unknown) {
        const msg = profileError instanceof Error ? profileError.message : 'profile_update_failed';
        logger.error('[API] profile update failed', profileError as Error);
        return NextResponse.json(
          { ok: false, error: msg },
          { status: 400 },
        );
      }
    }

    // Update patients (optional)
    if (patient) {
      const snake = buildPatientUpdatePayload(patient);
      try {
        const upd = await admin.from('patients').update(snake).eq('user_id', userId).select('*').maybeSingle();
        if (upd.error) throw upd.error;
        if (!upd.data) {
          // create if missing
          const ins = await admin.from('patients').upsert({ user_id: userId, ...snake }, { onConflict: 'user_id' }).select('*').maybeSingle();
          if (ins.error) throw ins.error;
          updatedPatient = ins.data;
        } else {
          updatedPatient = upd.data;
        }
      } catch (err: unknown) {
        // Ignore if table not present or columns differ
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn('[API] patients update skipped:', msg);
      }
    }

    // Fire-and-forget: resincronizar contexto y archivos personalizados
    try {
      const ctx = await buildPatientContext(userId, admin);
      await persistPatientContextFiles(userId, ctx, admin);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.warn('[API] context resync after profile update failed:', msg);
    }

    return NextResponse.json({ ok: true, data: { profile: updatedProfile, patient: updatedPatient } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'internal_error';
    logger.error('[API] profile PATCH error', e as Error);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
