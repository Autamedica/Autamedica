import { getUserIdFromRequest } from '@/lib/server/auth';
import { createAdminClient } from '@autamedica/auth/server';
import { logger } from '@autamedica/shared';
import type { AppSupabaseClient } from '@autamedica/supabase-client';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const userId = await getUserIdFromRequest();
    if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

    const admin = createAdminClient() as any as AppSupabaseClient;

    const [{ data: profile }, { data: patient }] = await Promise.all([
      (admin as any).from('profiles').select('*').eq('id', userId).maybeSingle(),
      (admin as any).from('patients').select('*').eq('user_id', userId).maybeSingle(),
    ]);

    const summary = {
      name: ([profile?.first_name, profile?.last_name].filter(Boolean).join(' ').trim() || (profile as any)?.full_name) || null,
      email: profile?.email ?? null,
      role: profile?.role ?? 'patient',
      portal: (profile as any)?.portal ?? 'patients',
      gender: patient?.gender ?? null,
      bloodType: patient?.blood_type ?? null,
      heightCm: patient?.height_cm ?? null,
      weightKg: patient?.weight_kg ?? null,
      birthDate: patient?.birth_date ?? null,
    };

    return NextResponse.json({ ok: true, data: { summary } });
  } catch (e: any) {
    logger.error('[AI] context GET error', e);
    return NextResponse.json({ ok: false, error: e?.message || 'internal_error' }, { status: 500 });
  }
}
