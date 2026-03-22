import type { APIRoute } from 'astro'
import { createServerClientFromRequest } from '@autamedica/auth/server'
import { logger } from '@autamedica/shared'
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

    const [medicationsRes, conditionsRes, allergiesRes, timelineRes, anamnesisRes] =
      await Promise.all([
        // Active medications (prescriptions)
        supabase
          .from('medical_records')
          .select('*')
          .eq('patient_id', context.patientId)
          .eq('type', 'prescription'),

        // Conditions (diagnoses)
        supabase
          .from('medical_records')
          .select('*')
          .eq('patient_id', context.patientId)
          .eq('type', 'diagnosis'),

        // Allergies
        supabase
          .from('medical_records')
          .select('*')
          .eq('patient_id', context.patientId)
          .eq('type', 'allergy'),

        // Timeline (all records, recent first)
        supabase
          .from('medical_records')
          .select('*')
          .eq('patient_id', context.patientId)
          .order('created_at', { ascending: false })
          .limit(50),

        // Anamnesis
        supabase
          .from('anamnesis')
          .select('*')
          .eq('patient_id', context.patientId),
      ])

    if (medicationsRes.error) {
      logger.error('[medical-history/GET] Medications query failed', medicationsRes.error)
    }
    if (conditionsRes.error) {
      logger.error('[medical-history/GET] Conditions query failed', conditionsRes.error)
    }
    if (allergiesRes.error) {
      logger.error('[medical-history/GET] Allergies query failed', allergiesRes.error)
    }
    if (timelineRes.error) {
      logger.error('[medical-history/GET] Timeline query failed', timelineRes.error)
    }
    if (anamnesisRes.error) {
      logger.error('[medical-history/GET] Anamnesis query failed', anamnesisRes.error)
    }

    const medications = medicationsRes.data ?? []
    const conditions = conditionsRes.data ?? []
    const allergies = allergiesRes.data ?? []
    const timeline = timelineRes.data ?? []
    const anamnesis = anamnesisRes.data ?? []

    const summary = {
      medications,
      conditions,
      allergies,
    }

    return json({
      success: true,
      data: {
        summary,
        timeline,
        anamnesis,
      },
    })
  } catch (err) {
    logger.error('[medical-history/GET] Unexpected error', err)
    return json({ success: false, error: 'Internal server error' }, 500)
  }
}
