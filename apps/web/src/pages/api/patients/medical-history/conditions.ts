import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const body = await request.json()
    const { name, status: conditionStatus, diagnosed_date, notes } = body as {
      name?: string
      status?: string
      diagnosed_date?: string
      notes?: string
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return json({ success: false, error: 'name is required' }, 400)
    }

    const supabase = createServerClientFromRequest(request)

    const { data: inserted, error } = await supabase
      .from('medical_records')
      .insert({
        patient_id: context.patientId,
        type: 'diagnosis',
        title: name.trim(),
        content: { status: conditionStatus, diagnosed_date, notes },
      } as never)
      .select('*')
      .single()

    if (error) {
      logger.error('[medical-history/conditions/POST] Insert failed', error)
      return json({ success: false, error: 'Failed to add condition' }, 500)
    }

    return json({ success: true, data: inserted }, 201)
  } catch (err) {
    logger.error('[medical-history/conditions/POST] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}
