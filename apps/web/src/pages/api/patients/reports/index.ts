/**
 * API Controller: Patient medical reports listing.
 *
 * GET /api/patients/reports -- List consultation reports for the authenticated patient.
 *
 * Architecture: Capa 5 (Controller) -- validates auth, delegates to Repository.
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { createMedicalHistoryAdapter } from '@/lib/patients/lib/repos/medical-history.adapter'
import { logger } from '@autamedica/shared'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) {
    return json({ success: false, error: 'unauthorized' }, 401)
  }

  try {
    const admin = createAstroAdminClient(locals.runtime?.env)
    const medicalHistoryRepo = createMedicalHistoryAdapter(admin)
    const records = await medicalHistoryRepo.listConsultations(context.patientId)

    const enriched = await Promise.all(
      records.map(async (record) => {
        const content = record.content as Record<string, unknown>
        let doctorName = (content.doctorName as string) ?? null

        if (!doctorName) {
          try {
            const { data: rec } = await admin
              .from('medical_records')
              .select('doctor_id')
              .eq('id', record.id)
              .single()

            if (rec?.doctor_id) {
              const { data: profile } = await admin
                .from('profiles')
                .select('first_name, last_name')
                .eq('user_id', rec.doctor_id)
                .single()
              doctorName = profile
                ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null
                : null
            }
          } catch {
            // Ignore enrichment failures
          }
        }

        return {
          id: record.id,
          title: record.title,
          type: record.type,
          dateRecorded: record.created_at,
          doctorName,
          hasSoap: !!(content.subjective || content.objective || content.assessment || content.plan),
          aiGenerated: content.aiGenerated ?? false,
        }
      })
    )

    return json({ success: true, data: enriched })
  } catch (err) {
    logger.error('[reports/GET]', err)
    return json({ success: false, error: 'internal_error' }, 500)
  }
}
