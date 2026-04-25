import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { jsonOk, internalError } from '@/lib/api-helpers'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { logger } from '@autamedica/shared'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const adminClient = createAstroAdminClient(locals.runtime?.env)
    
    // Fetch 10 recent patients to simulate community pulse
    const { data: profiles, error } = await adminClient
      .from('profiles')
      .select('email, created_at')
      .eq('role', 'patient')
      .not('email', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      logger.error('[community-pulse] DB error', error)
      throw error
    }

    const pulseItems = (profiles || []).map(p => {
      let maskedEmail = p.email
      if (maskedEmail?.includes('@')) {
        const [local, domain] = maskedEmail.split('@')
        if (local.length > 2) {
          maskedEmail = `${local.substring(0, 2)}***@${domain}`
        } else {
          maskedEmail = `***@${domain}`
        }
      }
      return {
        email: maskedEmail,
        joinedAt: p.created_at
      }
    })

    return jsonOk(pulseItems)
  } catch (err) {
    logger.error('[community-pulse] GET error', err)
    return internalError()
  }
}
