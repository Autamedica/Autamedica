import { buildPatientContext, persistPatientContextFiles } from '@/lib/ai/context-builder'
import { getUserIdFromRequest } from '@/lib/server/auth'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import type { AppSupabaseClient } from '@autamedica/supabase-client'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const profile = body?.profile as Record<string, unknown> | undefined
    const patient = body?.patient as Record<string, unknown> | undefined
    if (!profile && !patient) return NextResponse.json({ ok: false, error: 'no_updates' }, { status: 400 })

    const admin = createAdminClient() as any as AppSupabaseClient;

    // Apply profile updates
    if (profile && Object.keys(profile).length > 0) {
      try {
        const snake: any = {}
        if ('firstName' in profile) snake.first_name = (profile as any).firstName
        if ('lastName' in profile) snake.last_name = (profile as any).lastName
        if ('phone' in profile) snake.phone = (profile as any).phone;
        if ('email' in profile) snake.email = (profile as any).email;

        // Update profiles with typed columns (PK is 'id' which is the auth user id)
        const upd = await admin.from('profiles').update(snake).eq('id', userId).select('*').single();
        if (upd.error) throw upd.error;
      } catch (err: any) {
        logger.error('[AI] update profile failed', err);
        return NextResponse.json({ ok: false, error: err.message || 'profile_update_failed' }, { status: 400 });
      }
    }

    // Apply patient updates (optional, tolerate schema diffs)
    if (patient && Object.keys(patient).length > 0) {
      const snake: any = {}
      if ('heightCm' in patient) snake.height_cm = (patient as any).heightCm
      if ('weightKg' in patient) snake.weight_kg = (patient as any).weightKg
      if ('bloodType' in patient) snake.blood_type = (patient as any).bloodType
      if ('gender' in patient) snake.gender = (patient as any).gender
      if ('birthDate' in patient) snake.birth_date = (patient as any).birthDate

      try {
        const upd = await admin.from('patients').update(snake).eq('user_id', userId).select('*').maybeSingle()
        if (upd.error) throw upd.error
        if (!upd.data) {
          await admin.from('patients').upsert({ user_id: userId, ...snake }, { onConflict: 'user_id' })
        }
      } catch (err: any) {
        // Swallow if table/columns unavailable
        logger.warn('[AI] patients update skipped:', err?.message || err)
      }
    }

    // Rebuild and persist context files
    const ctx = await buildPatientContext(userId, admin)
    const persisted = await persistPatientContextFiles(userId, ctx, admin)

    return NextResponse.json({ ok: true, data: { summary: ctx.summary, storage: persisted } })
  } catch (e: any) {
    logger.error('[AI] update error', e)
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 })
  }
}
