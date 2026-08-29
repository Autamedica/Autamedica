import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { badRequest, internalError, jsonOk, unauthorized } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { getRuntimeEnvValue } from '@/lib/runtime-env'

const MERCADOPAGO_API = 'https://api.mercadopago.com'

export const GET: APIRoute = async ({ params, request, locals }) => {
  const patientContext = await resolvePatientContext(request, locals)
  if (!patientContext) return unauthorized('patient_unauthorized')

  const paymentId = params.id
  if (!paymentId) return badRequest('payment_id_required')

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)

    // 1. Verificar primeiro en DB local si ya está aprobado
    const { data: sub } = await admin
      .from('patient_subscriptions' as never)
      .select('status, tier')
      .eq('patient_id', patientContext.patientId)
      .maybeSingle()

    if (sub && (sub as { status?: string }).status === 'active' && (sub as { tier?: string }).tier === 'cuidado') {
      return jsonOk({
        status: 'approved',
        type: 'subscription',
      })
    }

    const { data: aptPayment } = await admin
      .from('appointment_payments')
      .select('status, appointment_id')
      .or(`provider_payment_id.eq.${paymentId},appointment_id.eq.${paymentId}`)
      .eq('patient_id', patientContext.patientId)
      .maybeSingle()

    if (aptPayment && (aptPayment as { status?: string }).status === 'approved') {
      return jsonOk({
        status: 'approved',
        type: 'appointment',
        appointmentId: (aptPayment as { appointment_id?: string }).appointment_id,
      })
    }

    // 2. Si no está aprobado en DB, consultar directamente a MercadoPago API
    const mpToken = getRuntimeEnvValue('MERCADOPAGO_ACCESS_TOKEN') ?? import.meta.env?.MERCADOPAGO_ACCESS_TOKEN
    if (!mpToken) {
      return jsonOk({
        status: (aptPayment as { status?: string } | null)?.status ?? (sub as { status?: string } | null)?.status ?? 'pending',
      })
    }

    // Solo si el ID parece numérico de MercadoPago
    if (/^\d+$/.test(paymentId)) {
      const mpRes = await fetch(`${MERCADOPAGO_API}/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${mpToken}`,
        },
      })

      if (mpRes.ok) {
        const mpPayment = await mpRes.json()
        const mpStatus = mpPayment.status

        if (mpStatus === 'approved') {
          const externalRef = mpPayment.external_reference || ''
          const metadata = mpPayment.metadata || {}

          // Verificar que el pago pertenezca al paciente autenticado
          const isOwner = 
            metadata.patient_id === patientContext.patientId ||
            externalRef.startsWith(`sub:${patientContext.patientId}`) ||
            externalRef.startsWith(`apt:`)

          if (!isOwner) {
            return jsonOk({
              status: mpStatus,
              statusDetail: 'unauthorized_payment_reference',
            })
          }

          if (metadata.payment_type === 'subscription' || externalRef.startsWith('sub:')) {
            // Verificar si ya tiene periodo activo para no resetearlo
            const { data: existingSub } = await admin
              .from('patient_subscriptions' as never)
              .select('status, current_period_end')
              .eq('patient_id', patientContext.patientId)
              .maybeSingle()

            const isAlreadyActive = (existingSub as { status?: string } | null)?.status === 'active'

            await admin.from('patient_subscriptions' as never).upsert(
              {
                patient_id: patientContext.patientId,
                tier: 'cuidado',
                status: 'active',
                price_cents: 4990,
                currency: 'BRL',
                payment_provider: 'mercadopago_pix',
                provider_subscription_id: String(paymentId),
                current_period_start: isAlreadyActive ? undefined : new Date().toISOString(),
                current_period_end: isAlreadyActive ? undefined : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              } as never,
              { onConflict: 'patient_id' },
            )

            await admin.rpc('ensure_patient_health_reserve' as never, {
              p_patient_id: patientContext.patientId,
            } as never)

            return jsonOk({
              status: 'approved',
              type: 'subscription',
            })
          }

          if (metadata.payment_type === 'appointment' || externalRef.startsWith('apt:')) {
            const aptId = metadata.appointment_id || externalRef.replace('apt:', '')
            if (aptId) {
              await admin
                .from('appointment_payments')
                .update({
                  status: 'approved',
                  paid_at: mpPayment.date_approved || new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as never)
                .eq('appointment_id', aptId)

              await admin
                .from('appointments')
                .update({
                  status: 'confirmed',
                  updated_at: new Date().toISOString(),
                } as never)
                .eq('id', aptId)

              return jsonOk({
                status: 'approved',
                type: 'appointment',
                appointmentId: aptId,
              })
            }
          }
        }

        return jsonOk({
          status: mpStatus,
          statusDetail: mpPayment.status_detail,
        })
      }
    }

    return jsonOk({
      status: (aptPayment as { status?: string } | null)?.status ?? (sub as { status?: string } | null)?.status ?? 'pending',
    })
  } catch (error) {
    logger.error('[pix/status] GET error', error)
    return internalError('failed_to_check_pix_status')
  }
}
