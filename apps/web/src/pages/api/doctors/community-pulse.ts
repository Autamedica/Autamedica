import type { APIRoute } from 'astro'
import { createAstroAdminClient } from '@/lib/supabase'
import { jsonOk, internalError } from '@/lib/api-helpers'
import { withAuth, isAuthed } from '@/lib/api-auth'
import { logger } from '@autamedica/shared'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuth(request, locals)
  if (!isAuthed(auth)) return auth

  try {
    const adminClient = createAstroAdminClient(locals.runtime?.env)
    
    // Consulta directa a profiles para máxima fiabilidad
    const { data: profiles, error } = await adminClient
      .from('profiles')
      .select('email, created_at, first_name, last_name')
      .eq('role', 'patient')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      logger.error('[community-pulse] DB error', error)
      throw error
    }

    const pulseItems = (profiles || []).map(p => {
      let displayName = 'Paciente'
      if (p.first_name || p.last_name) {
        displayName = `${p.first_name || ''} ${p.last_name || ''}`.trim()
      }
      
      let maskedEmail = p.email || 'anonimo@red.autamedica'
      if (maskedEmail.includes('@')) {
        const [local, domain] = maskedEmail.split('@')
        maskedEmail = `${local.substring(0, 2)}***@${domain}`
      }

      return {
        name: displayName,
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
