/**
 * POST /api/patients/appointments/smart-suggest
 *
 * Given a patient's latest anamnesis extraction, recommends specialty + urgency
 * and returns the next 3 available slots across all matching doctors.
 *
 * Body: { anamnesisId?: string } — optional; when omitted, resolves from patient context.
 */
import type { APIRoute } from 'astro'
import { z } from 'zod'
import { logger } from '@autamedica/shared'
import { getOpenSlots } from '@autamedica/scheduling'
import type { UUID, ScheduleSlot } from '@autamedica/types'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolveTriageFromExtraction, getSpecialtyDisplayName } from '@/lib/patients/server/symptom-specialty-map'
import type { AnamnesisExtractionResult } from '@/lib/patients/types/anamnesis-extraction'
import { validateBody } from '@/lib/validation'
import { jsonOk, unauthorized, badRequest, notFound, internalError } from '@/lib/api-helpers'
import { captureSentryException } from '@/lib/observability/sentry'

const SmartSuggestSchema = z.object({
  anamnesisId: z.string().uuid('anamnesisId must be a valid UUID').optional(),
})

interface SlotSuggestion {
  doctorId: string
  doctorName: string
  specialty: string
  date: string
  startTime: string
  endTime: string
  durationMinutes: number
  location: string | null
}

interface SmartSuggestResponse {
  specialty: string
  specialtyDisplay: string
  urgency: string
  urgencyLabel: string
  suggestions: SlotSuggestion[]
}

/** How many days ahead to search for slots */
const SEARCH_DAYS = 14
/** Max suggestions to return */
const MAX_SUGGESTIONS = 3

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const raw = await request.json().catch(() => ({}))
  const parsed = validateBody(SmartSuggestSchema, raw)
  if (parsed.success === false) return parsed.error

  const { anamnesisId: providedAnamnesisId } = parsed.data

  try {
    const admin = createAstroAdminClient()

    // 1a. Resolve anamnesis ID — use provided or look up from patient
    let anamnesisId = providedAnamnesisId
    if (!anamnesisId) {
      const { data: anamnesis, error: aErr } = await admin
        .from('anamnesis')
        .select('id')
        .eq('patient_id', context.patientId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (aErr || !anamnesis) {
        return notFound('No se encontró anamnesis para este paciente')
      }
      anamnesisId = (anamnesis as unknown as { id: string }).id
    }

    // 1b. Fetch latest extraction for this anamnesis
    const { data: extraction, error: extErr } = await admin
      .from('anamnesis_extractions' as never)
      .select('extraction_result, checkpoint')
      .eq('anamnesis_id', anamnesisId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (extErr) {
      captureSentryException(extErr, {
        runtimeEnv: locals.runtime?.env,
        layer: 'controller',
        surface: 'api/patients/appointments/smart-suggest:extraction',
        owner: 'Clinical Web',
        context: {
          patientId: context.patientId,
          anamnesisId,
        },
        tags: {
          route: '/api/patients/appointments/smart-suggest',
        },
      })
      logger.error('[smart-suggest] Error fetching extraction', extErr)
      return internalError()
    }

    if (!extraction) {
      return notFound('No se encontró una extracción para esta anamnesis')
    }

    const result = (extraction as unknown as { extraction_result: Record<string, unknown> }).extraction_result as unknown as AnamnesisExtractionResult
    const normalized = result?.normalizedOpenFields
    if (!normalized) {
      return badRequest('La extracción no contiene datos normalizados')
    }

    // 2. Resolve triage
    const triage = resolveTriageFromExtraction(
      normalized.chiefComplaintCode,
      normalized.redFlagCodes ?? [],
    )

    // 3. Find doctors matching any of the recommended specialties
    const { data: doctors, error: docErr } = await admin
      .from('doctors')
      .select('id, specialty, user_id, profile:profiles!doctors_user_id_fkey(first_name, last_name)')
      .eq('active', true)
      .in('specialty', triage.specialties)

    if (docErr) {
      captureSentryException(docErr, {
        runtimeEnv: locals.runtime?.env,
        layer: 'controller',
        surface: 'api/patients/appointments/smart-suggest:doctors',
        owner: 'Clinical Web',
        context: {
          patientId: context.patientId,
          specialties: triage.specialties,
        },
        tags: {
          route: '/api/patients/appointments/smart-suggest',
        },
      })
      logger.error('[smart-suggest] Error fetching doctors', docErr)
      return internalError()
    }

    if (!doctors || doctors.length === 0) {
      const response: SmartSuggestResponse = {
        specialty: triage.specialties[0] ?? 'clínica médica',
        specialtyDisplay: getSpecialtyDisplayName(triage.specialties[0] ?? 'clínica médica'),
        urgency: triage.urgency,
        urgencyLabel: triage.urgencyLabel,
        suggestions: [],
      }
      return jsonOk(response)
    }

    // 4. Get open slots for each doctor in the next SEARCH_DAYS days
    const today = new Date()
    const dateFrom = formatDate(today)
    const futureDate = new Date(today)
    futureDate.setDate(futureDate.getDate() + SEARCH_DAYS)
    const dateTo = formatDate(futureDate)

    type DoctorRow = {
      id: string
      specialty: string | null
      user_id: string
      profile: { first_name: string | null; last_name: string | null } | null
    }

    const allSlots: Array<ScheduleSlot & { doctorName: string; specialty: string }> = []

    for (const doc of (doctors as unknown as DoctorRow[])) {
      const firstName = doc.profile?.first_name ?? ''
      const lastName = doc.profile?.last_name ?? ''
      const doctorName = [firstName, lastName].filter(Boolean).join(' ')
      const label = doctorName ? `Dr. ${doctorName}` : 'Profesional disponible'

      const slots = await getOpenSlots(admin, {
        doctor_id: doc.id as UUID,
        date_from: dateFrom,
        date_to: dateTo,
      })

      // Take only the first few from each doctor to limit total work
      for (const slot of slots.slice(0, MAX_SUGGESTIONS)) {
        allSlots.push({
          ...slot,
          doctorName: label,
          specialty: doc.specialty ?? 'clínica médica',
        })
      }
    }

    // 5. Sort by date/time ascending and pick top MAX_SUGGESTIONS
    allSlots.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

    const suggestions: SlotSuggestion[] = allSlots
      .slice(0, MAX_SUGGESTIONS)
      .map((s) => ({
        doctorId: s.doctor_id,
        doctorName: s.doctorName,
        specialty: s.specialty,
        date: s.date,
        startTime: s.start_time,
        endTime: s.end_time,
        durationMinutes: s.duration_minutes,
        location: s.location,
      }))

    const primarySpecialty = triage.specialties[0] ?? 'clínica médica'
    const response: SmartSuggestResponse = {
      specialty: primarySpecialty,
      specialtyDisplay: getSpecialtyDisplayName(primarySpecialty),
      urgency: triage.urgency,
      urgencyLabel: triage.urgencyLabel,
      suggestions,
    }

    return jsonOk(response)
  } catch (err) {
    captureSentryException(err, {
      runtimeEnv: locals.runtime?.env,
      layer: 'controller',
      surface: 'api/patients/appointments/smart-suggest:unexpected',
      owner: 'Clinical Web',
      context: {
        patientId: context.patientId,
      },
      tags: {
        route: '/api/patients/appointments/smart-suggest',
      },
    })
    logger.error('[smart-suggest] Unexpected error', err)
    return internalError()
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
