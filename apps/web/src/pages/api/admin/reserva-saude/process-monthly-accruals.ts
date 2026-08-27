import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false

function isAuthorized(request: Request, runtimeEnv: Record<string, unknown> | null | undefined): boolean {
  const envCronSecret = (runtimeEnv?.CRON_SECRET ?? runtimeEnv?.TRIGGER_KEY ?? runtimeEnv?.RESERVA_SAUDE_WEBHOOK_SECRET) as string | undefined
  const importSecret = (import.meta.env.CRON_SECRET ?? import.meta.env.TRIGGER_KEY ?? import.meta.env.RESERVA_SAUDE_WEBHOOK_SECRET) as string | undefined
  const secret = envCronSecret || importSecret

  if (!secret) {
    // Si no hay secret configurado y estamos en DEV permitimos
    if (import.meta.env.DEV) return true
    return false
  }

  const authHeader = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const triggerKey = request.headers.get('x-trigger-key') ?? request.headers.get('x-cron-secret') ?? request.headers.get('x-webhook-secret')

  return authHeader === secret || triggerKey === secret
}

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    if (!isAuthorized(request, locals.runtime?.env)) {
      return unauthorized('invalid_cron_or_trigger_authorization')
    }

    let periodKey: string | null = null
    try {
      const body = await request.json()
      if (body && typeof body.period === 'string' && body.period.trim()) {
        periodKey = body.period.trim()
      }
    } catch {
      // Body vacío o sin JSON es válido, usará el mes por defecto
    }

    const admin = createAstroAdminClient(locals.runtime?.env)

    logger.info('[api/admin/reserva-saude/process-monthly-accruals] Executing monthly accruals batch', {
      periodKey: periodKey || 'current_month',
    })

    const { data: result, error } = await admin.rpc('process_all_monthly_reserve_accruals' as never, {
      p_period_key: periodKey,
    } as never)

    if (error) {
      logger.error('[api/admin/reserva-saude/process-monthly-accruals] RPC error', error)
      throw error
    }

    logger.info('[api/admin/reserva-saude/process-monthly-accruals] Accruals processed successfully', result)

    return jsonOk({
      success: true,
      summary: result,
    })
  } catch (error) {
    logger.error('[api/admin/reserva-saude/process-monthly-accruals] Unhandled error', error)
    return internalError('failed_to_process_monthly_reserve_accruals', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export const GET: APIRoute = async ({ request, locals }) => {
  // Permitir disparar vía GET para soporte con servicios de cron externos simples
  return POST({ request, locals } as never)
}
