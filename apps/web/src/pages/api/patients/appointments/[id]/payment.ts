import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service'
import { conflict, internalError, jsonOk, notFound, unauthorized } from '@/lib/api-helpers'

export const POST: APIRoute = async ({ request, params, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()
  if (!params.id?.trim()) return notFound('appointment_not_found')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const payment = await appointmentPaymentsService.createCheckoutPreference(admin, {
      appointmentId: params.id,
      patientId: context.patientId,
    })

    return jsonOk(payment, 201)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal_error'

    if (message === 'appointment_not_found') return notFound(message)
    if (message === 'appointment_access_denied') return unauthorized(message)
    if (message === 'appointment_doctor_missing') return conflict(message)
    if (message === 'doctor_consultation_fee_missing') return conflict(message)

    logger.error('[patients/appointments/[id]/payment] POST error', error)
    return internalError()
  }
}
