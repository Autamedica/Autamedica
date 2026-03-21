import { buildPatientContext, persistPatientContextFiles } from '@/lib/ai/context-builder'
import { getUserIdFromRequest } from '@/lib/server/auth'
import { createAdminClient } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import type { Database } from '@autamedica/types'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
type PatientUpdate = Database['public']['Tables']['patients']['Update']
type PatientInsert = Database['public']['Tables']['patients']['Insert']

export async function POST(request: Request) {
  try {
    const userId = await getUserIdFromRequest()
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const profile = body?.profile as Record<string, unknown> | undefined
    const patient = body?.patient as Record<string, unknown> | undefined
    if (!profile && !patient) return NextResponse.json({ ok: false, error: 'no_updates' }, { status: 400 })

    const admin = createAdminClient();

    // Apply profile updates
    if (profile && Object.keys(profile).length > 0) {
      try {
        const snake: Record<string, unknown> = {}
        if ('firstName' in profile) snake.first_name = profile.firstName
        if ('lastName' in profile) snake.last_name = profile.lastName
        if ('phone' in profile) snake.phone = profile.phone
        if ('email' in profile) snake.email = profile.email

        const upd = await admin.from('profiles').update(snake as unknown as ProfileUpdate).eq('user_id', userId).select('*').single();
        if (upd.error) throw upd.error;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'profile_update_failed'
        logger.error('[AI] update profile failed', err as Error);
        return NextResponse.json({ ok: false, error: msg }, { status: 400 });
      }
    }

    // Apply patient updates (optional, tolerate schema diffs)
    if (patient && Object.keys(patient).length > 0) {
      const snake: Record<string, unknown> = {}
      if ('heightCm' in patient) snake.height_cm = patient.heightCm
      if ('weightKg' in patient) snake.weight_kg = patient.weightKg
      if ('bloodType' in patient) snake.blood_type = patient.bloodType
      if ('gender' in patient) snake.gender = patient.gender
      if ('birthDate' in patient) snake.birth_date = patient.birthDate

      try {
        const upd = await admin.from('patients').update(snake as unknown as PatientUpdate).eq('user_id', userId).select('*').maybeSingle()
        if (upd.error) throw upd.error
        if (!upd.data) {
          await admin.from('patients').upsert({ user_id: userId, ...snake } as unknown as PatientInsert, { onConflict: 'user_id' })
        }
      } catch (err: unknown) {
        // Swallow if table/columns unavailable
        const msg = err instanceof Error ? err.message : String(err)
        logger.warn('[AI] patients update skipped:', msg)
      }
    }

    // Rebuild and persist context files
    const ctx = await buildPatientContext(userId, admin)
    const persisted = await persistPatientContextFiles(userId, ctx, admin)

    return NextResponse.json({ ok: true, data: { summary: ctx.summary, storage: persisted } })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    logger.error('[AI] update error', e as Error)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
