import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, serviceUnavailable } from '@/lib/api-helpers'
import { checkRateLimit } from '@/lib/rate-limit'
import { createAstroAdminClient } from '@/lib/supabase'

export const prerender = false

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_TEXT = 500
const MAX_URL = 2000
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const RATE_LIMIT_MAX = 10

type LeadRequest = {
  email?: unknown
  name?: unknown
  phone?: unknown
  vertical?: unknown
  intent?: unknown
  form_id?: unknown
  consent_marketing?: unknown
  consent_source?: unknown
  page_url?: unknown
  referrer?: unknown
  attribution?: unknown
  metadata?: unknown
  anonymous_id?: unknown
  session_id?: unknown
  company?: unknown
  website?: unknown
  hp?: unknown
}

type QueryResult<T> = Promise<{ data: T | null; error: unknown }>
type LeadRow = { id: string; email: string; status: string }
type LeadsTable = {
  upsert: (
    values: Record<string, unknown>,
    options: { onConflict: string },
  ) => {
    select: (columns: string) => {
      single: () => QueryResult<LeadRow>
    }
  }
}
type GrowthEventsTable = {
  insert: (values: Record<string, unknown>) => Promise<{ error: unknown }>
}
interface GrowthSchemaClient {
  from(table: 'leads'): LeadsTable
  from(table: 'growth_events'): GrowthEventsTable
  rpc(name: 'enqueue_nurturing_emails', args: { batch_limit: number }): Promise<{ data: number | null; error: unknown }>
}
type GrowthAdminClient = {
  schema: (schemaName: 'growth_os') => GrowthSchemaClient
}

function text(value: unknown, fallback = '', max = MAX_TEXT): string {
  if (typeof value !== 'string') return fallback
  return value.trim().slice(0, max)
}

function nullableText(value: unknown, max = MAX_TEXT): string | null {
  const normalized = text(value, '', max)
  return normalized.length > 0 ? normalized : null
}

function slug(value: unknown, fallback: string): string {
  const normalized = text(value, fallback, 80).toLowerCase()
  return /^[a-z0-9_-]+$/.test(normalized) ? normalized : fallback
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  )
}

function utm(attribution: Record<string, unknown>, key: string): string | null {
  return nullableText(attribution[key], 160)
}

function isSpamTrapFilled(body: LeadRequest): boolean {
  return Boolean(text(body.company).length || text(body.website).length || text(body.hp).length)
}

async function enqueueNurturing(admin: GrowthAdminClient): Promise<number> {
  const { data, error } = await admin
    .schema('growth_os')
    .rpc('enqueue_nurturing_emails', { batch_limit: 25 })

  if (error) throw error
  return typeof data === 'number' ? data : 0
}

export const POST: APIRoute = async ({ request, locals }) => {
  const ip = getClientIp(request)
  if (!checkRateLimit(`growth-leads:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return serviceUnavailable('rate_limited')
  }

  let body: LeadRequest
  try {
    body = await request.json() as LeadRequest
  } catch {
    return badRequest('invalid_json')
  }

  if (isSpamTrapFilled(body)) {
    return jsonOk({ accepted: true, spam_filtered: true }, 202)
  }

  const email = text(body.email, '', 320).toLowerCase()
  if (!EMAIL_RE.test(email)) return badRequest('valid_email_required')

  const consentMarketing = body.consent_marketing === true
  if (!consentMarketing) return badRequest('marketing_consent_required')

  const attribution = jsonObject(body.attribution)
  const metadata = jsonObject(body.metadata)
  const vertical = slug(body.vertical, 'general')
  const formId = slug(body.form_id, 'newsletter')
  const intent = slug(body.intent, formId)

  try {
    const admin = createAstroAdminClient(locals.runtime?.env) as unknown as GrowthAdminClient
    const { data: lead, error: leadError } = await admin
      .schema('growth_os')
      .from('leads')
      .upsert(
        {
          email,
          name: nullableText(body.name),
          phone: nullableText(body.phone, 80),
          vertical,
          intent,
          form_id: formId,
          consent_marketing: true,
          consent_source: text(body.consent_source, formId, 160),
          page_url: nullableText(body.page_url, MAX_URL),
          referrer: nullableText(body.referrer, MAX_URL),
          first_utm_source: utm(attribution, 'utm_source'),
          first_utm_medium: utm(attribution, 'utm_medium'),
          first_utm_campaign: utm(attribution, 'utm_campaign'),
          first_utm_content: utm(attribution, 'utm_content'),
          first_utm_term: utm(attribution, 'utm_term'),
          attribution,
          metadata,
        },
        { onConflict: 'email_normalized,form_id,vertical' },
      )
      .select('id, email, status')
      .single()

    if (leadError || !lead) throw leadError ?? new Error('lead_upsert_empty')

    const { error: eventError } = await admin
      .schema('growth_os')
      .from('growth_events')
      .insert({
        event_type: 'lead_created',
        lead_id: lead.id,
        anonymous_id: nullableText(body.anonymous_id, 120),
        session_id: nullableText(body.session_id, 120),
        vertical,
        page_url: nullableText(body.page_url, MAX_URL),
        referrer: nullableText(body.referrer, MAX_URL),
        attribution,
        metadata: {
          ...metadata,
          form_id: formId,
          intent,
        },
      })

    if (eventError) throw eventError

    let emailJobsEnqueued = 0
    try {
      emailJobsEnqueued = await enqueueNurturing(admin)
    } catch (enqueueError) {
      logger.error('[growth/leads] Failed to enqueue nurturing email jobs', enqueueError)
    }

    return jsonOk({ id: lead.id, status: lead.status, email_jobs_enqueued: emailJobsEnqueued }, 201)
  } catch (err) {
    logger.error('[growth/leads] Failed to capture lead', err)
    return internalError('lead_capture_failed')
  }
}

export const GET: APIRoute = async () =>
  jsonOk({
    endpoint: 'growth-leads',
    accepts: 'POST',
    required: ['email', 'consent_marketing'],
  })

export const OPTIONS: APIRoute = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
