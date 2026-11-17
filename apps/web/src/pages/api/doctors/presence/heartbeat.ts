import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { forbidden, internalError } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    // The RPC resolves auth.uid() server-side; callers cannot heartbeat another doctor.
    const { data, error } = await auth.supabase.rpc(
      'heartbeat_my_doctor_presence' as never,
      {} as never,
    )

    if (error) {
      if (error.code === '42501') return forbidden('Se requiere un perfil médico activo')
      logger.error('[api/doctors/presence/heartbeat] RPC error', error)
      return internalError('No se pudo registrar la presencia médica')
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    logger.error('[api/doctors/presence/heartbeat] POST error', err)
    return internalError('No se pudo procesar la presencia médica')
  }
}
