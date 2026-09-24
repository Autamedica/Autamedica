import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { forbidden, internalError } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { pharmacyOnDemandService } from '@/lib/pharmacy/services/pharmacy-on-demand.service'

export const POST: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const doctor = await pharmacyOnDemandService.resolveDoctor(admin, auth.user.id)

    if (!doctor) {
      return forbidden('Perfil médico no encontrado')
    }

    const doctorId = doctor.id

    // Invocar doctor_heartbeat mediante el cliente autenticado con fallback al admin client
    let { error } = await auth.supabase.rpc('doctor_heartbeat' as never, {
      p_doctor_id: doctorId,
    } as never)

    if (error) {
      const fallback = await admin.rpc('public.doctor_heartbeat' as never, {
        p_doctor_id: doctorId,
      } as never)
      if (!fallback.error) {
        error = null
      }
    }

    if (error) {
      logger.error('[api/doctors/on-duty/heartbeat] RPC error', error)
      return internalError('Error al registrar latido de guardia médica')
    }

    const timestamp = new Date().toISOString()

    return new Response(
      JSON.stringify({
        success: true,
        timestamp,
        data: { timestamp },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    logger.error('[api/doctors/on-duty/heartbeat] POST error', err)
    return internalError('Error al procesar latido de guardia médica')
  }
}
