import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service'

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  try {
    const body = await request.json()
    const amount = Number(body.amount) // Amount in pesos (fiat)

    if (isNaN(amount) || amount <= 0) {
      return badRequest('invalid_amount')
    }

    const amountCents = Math.round(amount * 100)
    const supabase = createAstroAdminClient(locals.runtime?.env)

    // Retrieve patient profile email for MercadoPago payer email parameter
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('user_id', locals.session?.user?.id ?? '')
      .maybeSingle()

    if (profileError || !profile?.email) {
      return badRequest('patient_email_not_found')
    }

    // Call our newly added service to create a checkout preference on MercadoPago
    const preference = await appointmentPaymentsService.createWalletTopupPreference(
      supabase,
      context.patientId,
      amountCents,
      profile.email,
    )

    return jsonOk({
      preferenceId: preference.preferenceId,
      checkoutUrl: preference.checkoutUrl,
      amountCents,
      currency: 'ARS',
    })
  } catch (error) {
    logger.error('[patients/wallet/topup] POST error', error)
    return internalError('failed_to_initiate_wallet_topup')
  }
}
