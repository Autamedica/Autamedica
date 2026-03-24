import type { APIRoute } from 'astro'
import { createAdminClient, createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
import type { Database } from '@autamedica/types'
import { jsonOk, unauthorized, badRequest, internalError } from '@/lib/api-helpers'

type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
type PatientInsert = Database['public']['Tables']['patients']['Insert']

export const POST: APIRoute = async ({ request }) => {
  try {
    const supabase = createServerClientFromRequest(request)

    // Try auth via Authorization: Bearer <token> header first (works in dev across ports)
    const authHeader = request.headers.get('authorization')
    let userId: string | null = null

    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7)
      try {
        const adminForToken = createAdminClient()
        const { data: userRes, error: userErr } = await adminForToken.auth.getUser(token)
        if (!userErr && userRes?.user) userId = userRes.user.id
      } catch {
        void 0
      }
    }

    if (!userId) {
      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (!userErr && userData.user) {
        userId = userData.user.id
      }
    }

    if (!userId) {
      return unauthorized()
    }

    const body = await request.json().catch(() => ({}))
    const email = (body as Record<string, unknown>)?.email
    const admin = createAdminClient()

    // Ensure profiles row exists
    try {
      const { error: profileErr } = await admin
        .from('profiles')
        .upsert(
          {
            user_id: userId,
            email: typeof email === 'string' && email.length > 0 ? email : null,
            external_id: userId,
            role: 'patient',
          } as unknown as ProfileInsert,
          { onConflict: 'user_id' },
        )
        .select()
        .single()

      if (profileErr) {
        throw profileErr
      }
    } catch (e) {
      logger.error('[API] ensure profile failed (profiles)', e as Error)
      return badRequest('profiles_failed')
    }

    // Ensure patients row exists
    try {
      const { error: patientErr } = await admin
        .from('patients')
        .upsert(
          {
            user_id: userId,
            active: true,
          } as unknown as PatientInsert,
          { onConflict: 'user_id' },
        )
        .select()
        .single()

      if (patientErr) {
        throw patientErr
      }
    } catch {
      // ignore if table or constraint is different in this instance
    }

    return jsonOk(null)
  } catch (err) {
    logger.error('[API] profile ensure error', err as Error)
    return internalError()
  }
}
