import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

type AdminClient = ReturnType<typeof createAstroAdminClient>

async function assertAdmin(
  request: Request,
  admin: AdminClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locals?: any,
): Promise<{ ok: boolean; userId?: string }> {
  if (locals?.session?.user) {
    const userId = locals.session.user.id
    const { data: profile } = await admin
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()

    if (profile?.role && ['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) {
      return { ok: true, userId }
    }
  }

  const authHeader = request.headers.get('authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '')
  if (!token) return { ok: false }

  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) return { ok: false }

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('user_id', data.user.id)
    .maybeSingle()

  if (!profile?.role || !['admin', 'platform_admin', 'organization_admin'].includes(profile.role)) {
    return { ok: false }
  }

  return { ok: true, userId: data.user.id }
}

async function resolvePatientId(
  admin: AdminClient,
  input: { patientId?: string; email?: string },
): Promise<string | null> {
  if (input.patientId?.trim()) return input.patientId.trim()
  if (!input.email?.trim()) return null

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('user_id')
    .ilike('email', input.email.trim())
    .maybeSingle()

  if (profileError || !profile?.user_id) return null

  const { data: patient, error: patientError } = await admin
    .from('patients')
    .select('id')
    .eq('user_id', profile.user_id)
    .maybeSingle()

  if (patientError || !patient?.id) return null
  return patient.id
}

export const POST: APIRoute = async ({ request, locals }) => {
  const admin = createAstroAdminClient(locals.runtime?.env)
  const auth = await assertAdmin(request, admin, locals)
  if (!auth.ok) return unauthorized('admin role required')

  try {
    const body = await request.json()
    const patientId = await resolvePatientId(admin, {
      patientId: typeof body.patientId === 'string' ? body.patientId : undefined,
      email: typeof body.email === 'string' ? body.email : undefined,
    })
    const amountCents = Number(body.amountCents)
    const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
    const appointmentId = typeof body.appointmentId === 'string' && body.appointmentId.trim()
      ? body.appointmentId.trim()
      : null
    const expiresAt = typeof body.expiresAt === 'string' && body.expiresAt.trim()
      ? body.expiresAt.trim()
      : null

    if (!patientId) return badRequest('patientId or email is required')
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return badRequest('amountCents must be a positive integer')
    }
    if (!reason) return badRequest('reason is required')

    const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim()
      : `patient_credit:${patientId}:${appointmentId ?? 'manual'}:${amountCents}:${reason}`

    const { data, error } = await admin.rpc('grant_patient_wallet_credit' as never, {
      p_patient_id: patientId,
      p_amount_cents: amountCents,
      p_reason: reason,
      p_appointment_id: appointmentId,
      p_created_by: auth.userId ?? null,
      p_idempotency_key: idempotencyKey,
      p_expires_at: expiresAt,
    } as never)

    if (error) throw error

    const creditData = data ?? []
    const result = Array.isArray(creditData) ? creditData[0] : creditData
    return jsonOk({ patientId, credit: result }, 201)
  } catch (error) {
    logger.error('[admin/patient-wallet/credits] POST error', error)
    return internalError('failed_to_grant_patient_credit')
  }
}
