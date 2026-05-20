import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { ADMIN_ROLES, isAuthed, withAuthRole } from '@/lib/api-auth'
import { forbidden, internalError, jsonOk } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false

type RuntimeEnv = Record<string, unknown> | null | undefined

type AppointmentNotificationRisk = {
  appointment_id: string
  status: string
  start_time: string
  doctor_id: string
  patient_id: string | null
  doctor_user_id: string
  patient_user_id: string | null
  doctor_email: string | null
  doctor_phone: string | null
  patient_phone: string | null
  doctor_email_enqueued: boolean
  doctor_portal_notification_enqueued: boolean
  doctor_whatsapp_enqueued: boolean
  patient_whatsapp_reminder_enqueued: boolean
  risk_reasons: string[]
  urgency: 'p0' | 'p1' | 'p2'
}

type RiskQueryResponse = {
  data: AppointmentNotificationRisk[] | null
  error: { message: string } | null
}

type RiskQuery = PromiseLike<RiskQueryResponse> & {
  eq(column: string, value: string): RiskQuery
}

type RiskTable = {
  select(columns: string): RiskQuery & {
    order(column: string, options?: { ascending?: boolean }): RiskQuery & {
      order(column: string, options?: { ascending?: boolean }): RiskQuery & {
        limit(count: number): RiskQuery
      }
    }
  }
}

type GrowthOsClient = {
  schema(schema: 'growth_os'): {
    from(table: 'appointment_notification_risks'): RiskTable
  }
}

function readEnv(runtimeEnv: RuntimeEnv, key: string): string {
  const runtimeValue = runtimeEnv?.[key]
  if (typeof runtimeValue === 'string' && runtimeValue.length > 0) return runtimeValue
  const importValue = import.meta.env[key]
  return typeof importValue === 'string' ? importValue : ''
}

function isCronAuthorized(request: Request, runtimeEnv: RuntimeEnv): boolean {
  const secret = readEnv(runtimeEnv, 'CRON_SECRET') || readEnv(runtimeEnv, 'TRIGGER_KEY')
  if (!secret) return false

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const triggerKey = request.headers.get('x-trigger-key')
  return bearer === secret || triggerKey === secret
}

export const GET: APIRoute = async ({ request, locals }) => {
  const runtimeEnv = locals.runtime?.env

  try {
    if (!isCronAuthorized(request, runtimeEnv)) {
      const auth = await withAuthRole(request, ADMIN_ROLES, locals)
      if (!isAuthed(auth)) return auth
    }

    const url = new URL(request.url)
    const urgency = url.searchParams.get('urgency')
    const limitParam = Number(url.searchParams.get('limit') ?? '50')
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 200) : 50

    const admin = createAstroAdminClient(runtimeEnv) as unknown as GrowthOsClient
    let query = admin
      .schema('growth_os')
      .from('appointment_notification_risks')
      .select('*')
      .order('urgency', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(limit)

    if (urgency) {
      if (!['p0', 'p1', 'p2'].includes(urgency)) return forbidden()
      query = query.eq('urgency', urgency)
    }

    const { data, error } = await query

    if (error) {
      logger.error('[appointment-notification-risks] query failed', error)
      return internalError()
    }

    const risks = (data ?? []) as AppointmentNotificationRisk[]
    const summary = risks.reduce(
      (acc, risk) => {
        acc.total += 1
        acc[risk.urgency] += 1
        return acc
      },
      { total: 0, p0: 0, p1: 0, p2: 0 },
    )

    return jsonOk({ summary, risks })
  } catch (error) {
    logger.error('[appointment-notification-risks] GET error', error)
    return internalError()
  }
}
