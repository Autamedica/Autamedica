import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger, ensureServerEnv } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const supabase = createServerClientFromRequest(request)
    const now = new Date().toISOString()

    const [
      symptomsRes,
      medicationLogsRes,
      vitalSignsRes,
      upcomingAppointmentsRes,
      activeMedicationsRes,
    ] = await Promise.all([
      // Symptom reports
      supabase
        .from('symptom_reports')
        .select('*')
        .eq('patient_id', context.patientId)
        .order('created_at', { ascending: false }),

      // Medication logs
      supabase
        .from('medication_logs')
        .select('*')
        .eq('patient_id', context.patientId)
        .order('created_at', { ascending: false }),

      // Vital signs
      supabase
        .from('vital_signs')
        .select('*')
        .eq('patient_id', context.patientId)
        .order('created_at', { ascending: false }),

      // Upcoming appointments
      supabase
        .from('appointments')
        .select('*')
        .eq('patient_id', context.patientId)
        .gte('start_time', now)
        .in('status', ['scheduled', 'confirmed'])
        .order('start_time', { ascending: true }),

      // Active prescriptions
      supabase
        .from('medical_records')
        .select('*')
        .eq('patient_id', context.patientId)
        .eq('type', 'prescription'),
    ])

    if (symptomsRes.error) {
      logger.error('[medical-observations/GET] Symptoms query failed', symptomsRes.error)
    }
    if (medicationLogsRes.error) {
      logger.error('[medical-observations/GET] Medication logs query failed', medicationLogsRes.error)
    }
    if (vitalSignsRes.error) {
      logger.error('[medical-observations/GET] Vital signs query failed', vitalSignsRes.error)
    }
    if (upcomingAppointmentsRes.error) {
      logger.error('[medical-observations/GET] Upcoming appointments query failed', upcomingAppointmentsRes.error)
    }
    if (activeMedicationsRes.error) {
      logger.error('[medical-observations/GET] Active medications query failed', activeMedicationsRes.error)
    }

    return json({
      success: true,
      data: {
        symptoms: symptomsRes.data ?? [],
        medicationLogs: medicationLogsRes.data ?? [],
        vitalSigns: vitalSignsRes.data ?? [],
        upcomingAppointments: upcomingAppointmentsRes.data ?? [],
        activeMedications: activeMedicationsRes.data ?? [],
      },
    })
  } catch (err) {
    logger.error('[medical-observations/GET] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const context = await resolvePatientContext(request)
    if (!context) {
      return json({ success: false, error: 'Unauthorized' }, 401)
    }

    const supabaseUrl = ensureServerEnv('SUPABASE_URL')
    const supabaseAnonKey = ensureServerEnv('SUPABASE_ANON_KEY')

    const body = await request.json()

    // Forward to Supabase edge function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/ingest-patient-observation`

    const authHeader = request.headers.get('authorization')
    const bearerToken = authHeader?.startsWith('Bearer ')
      ? authHeader
      : `Bearer ${supabaseAnonKey}`

    const edgeResponse = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: bearerToken,
      },
      body: JSON.stringify({
        ...body,
        patient_id: context.patientId,
      }),
    })

    const responseData = await edgeResponse.json()

    return json(responseData, edgeResponse.status)
  } catch (err) {
    logger.error('[medical-observations/POST] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}
