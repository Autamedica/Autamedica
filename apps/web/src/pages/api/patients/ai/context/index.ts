/**
 * GET /api/patients/ai/context
 *
 * Devuelve el resumen de contexto del paciente autenticado.
 * Combina datos de profiles y patients en un summary unificado.
 */

import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAdminClient } from '@autamedica/auth/server'
import { getUserIdFromRequest } from '@/lib/patients/api/auth'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const userId = await getUserIdFromRequest(request)

    if (!userId) {
      return json({ ok: false, error: 'unauthorized' }, 401)
    }

    const admin = createAdminClient()

    const [{ data: profile }, { data: patient }] = await Promise.all([
      admin.from('profiles').select('*').eq('id', userId).maybeSingle(),
      admin.from('patients').select('*').eq('user_id', userId).maybeSingle(),
    ])

    const p = profile as Record<string, unknown> | null
    const pt = patient as Record<string, unknown> | null

    const fullName = typeof p?.full_name === 'string' ? p.full_name : null
    const firstName = typeof p?.first_name === 'string' ? p.first_name : null
    const lastName = typeof p?.last_name === 'string' ? p.last_name : null
    const derivedName = fullName ?? ([firstName, lastName].filter(Boolean).join(' ').trim() || null)

    const summary = {
      name: derivedName,
      email: typeof p?.email === 'string' ? p.email : null,
      role: typeof p?.role === 'string' ? p.role : null,
      portal: 'patients',
      gender: typeof pt?.gender === 'string' ? pt.gender : null,
      bloodType: typeof pt?.blood_type === 'string' ? pt.blood_type : null,
      heightCm: typeof pt?.height_cm === 'number' ? pt.height_cm : null,
      weightKg: typeof pt?.weight_kg === 'number' ? pt.weight_kg : null,
      birthDate: typeof pt?.birth_date === 'string' ? pt.birth_date : null,
    }

    return json({ ok: true, data: { summary } })
  } catch (err) {
    logger.error('[API] patients/ai/context error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}
