import type { APIRoute } from 'astro'
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import { withAuthRole, DOCTOR_ROLES, isAuthed } from '@/lib/api-auth'
import { internalError, jsonOk, forbidden } from '@/lib/api-helpers'
import { createAstroAdminClient } from '@/lib/supabase'

export const GET: APIRoute = async ({ request, locals }) => {
  const auth = await withAuthRole(request, DOCTOR_ROLES, locals)
  if (!isAuthed(auth)) return auth

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    // The generated Database types predate this PR's new RPC/dispatch tables.
    // Restrict the untyped client to the new schema surface; regenerate types after merge.
    const dispatchAdmin = admin as unknown as SupabaseClient
    const { data: doctor, error: doctorError } = await admin.from('doctors')
      .select('id, care_country, active').eq('user_id', auth.user.id).maybeSingle()
    if (doctorError) return internalError()
    if (!doctor?.active || (doctor.care_country !== 'AR' && doctor.care_country !== 'BR')) {
      return forbidden('care_country_credential_required')
    }
    // Admin clients bypass RLS: never return the country-wide patient list.
    // A physician sees only currently assigned unexpired offers to THEM.
    const { data: approved, error: approvalError } = await dispatchAdmin.rpc(
      'admin_is_dispatch_doctor_approved',
      { p_doctor_id: doctor.id },
    )
    if (approvalError) return internalError('No se pudo comprobar aprobación médica')
    if (approved !== true) return forbidden('doctor_pending_clinical_approval')

    const { data: duty, error: dutyError } = await admin
      .from('doctor_duty_status')
      .select('is_on_duty,last_heartbeat_at')
      .eq('doctor_id', doctor.id)
      .maybeSingle()
    if (dutyError) return internalError('No se pudo comprobar guardia')
    const heartbeatAge = duty?.last_heartbeat_at
      ? Date.now() - new Date(duty.last_heartbeat_at).getTime()
      : Number.POSITIVE_INFINITY
    if (!duty?.is_on_duty || heartbeatAge < 0 || heartbeatAge > 90_000) {
      return jsonOk({ queue: [], count: 0 })
    }

    const { data: offers, error: offersError } = await dispatchAdmin
      .from('dispatch_offers')
      .select('dispatch_request_id')
      .eq('doctor_id', doctor.id)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .limit(25)

    if (offersError) {
      logger.error('[api/doctors/on-duty/queue] offer_read_failed', { code: offersError.code ?? 'INTERNAL' })
      return internalError('No se pudo obtener las ofertas')
    }
    const offeredRequestIds = (offers || []).map(offer => offer.dispatch_request_id)
    if (offeredRequestIds.length === 0) return jsonOk({ queue: [], count: 0 })

    const { data, error } = await admin
      .from('pharmacy_dispatch_requests')
      .select('id, pharmacy_id, patient_dni, patient_cpf, patient_name, patient_phone, tier_requested, symptom_summary, status, created_at, care_country')
      .in('id', offeredRequestIds)
      .eq('status', 'searching')
      .eq('care_country', doctor.care_country)
      .order('created_at', { ascending: true })

    if (error) {
      logger.error('[api/doctors/on-duty/queue] DB error', { code: error.code ?? 'INTERNAL' })
      return internalError('No se pudo obtener las consultas ofrecidas')
    }

    const now = Date.now()
    const queue = (data || []).map((row) => {
      const createdTime = new Date(row.created_at).getTime()
      const diffMs = Math.max(0, now - createdTime)
      return {
        id: String(row.id),
        pharmacyId: row.pharmacy_id ? String(row.pharmacy_id) : null,
        pharmacyName: 'Farmacia / Kiosco On-Demand',
        patientDni: String(row.care_country === 'BR' ? (row.patient_cpf ?? '') : (row.patient_dni ?? '')),
        patientName: String(row.patient_name || 'Paciente Kiosco'),
        patientPhone: String(row.patient_phone),
        reason: String(row.symptom_summary || 'Motivo no especificado'),
        status: row.status,
        createdAt: String(row.created_at),
        minutesWaiting: Math.floor(diffMs / 60000),
      }
    })

    return jsonOk({
      queue,
      count: queue.length,
    })
  } catch (err) {
    logger.error('[api/doctors/on-duty/queue] GET error', err)
    return internalError('Error al obtener cola de solicitudes en farmacia')
  }
}

