import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { createAstroAdminClient } from '@/lib/supabase'
import { jsonOk, unauthorized, internalError } from '@/lib/api-helpers'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'

interface CareEpisodeRow {
  id: string
  doctor_id: string
  source_appointment_id: string
  status: string
  patient_visible_label: string
  included_ceeds_reviews: number
  used_ceeds_reviews: number
  valid_until: string
  opened_at: string
  closed_at: string | null
}

interface ClinicalIncidentRow {
  id: string
  care_episode_id: string | null
  condition_display: string
  severity: string
  status: string
  sla_deadline: string
}

// New care-episode tables exist before generated DB types are refreshed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function untypedAdmin(locals: App.Locals): { from: (table: string) => any } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAstroAdminClient(locals.runtime?.env) as unknown as { from: (table: string) => any }
}

function patientStatusForEpisode(episode: CareEpisodeRow, incidents: ClinicalIncidentRow[]): string {
  const hasOpenIncident = incidents.some((incident) => incident.status === 'open' || incident.status === 'escalated')
  if (episode.status === 'closed') return 'closed'
  if (episode.status === 'escalated') return 'medical_review_required'
  if (episode.status === 'closure_pending' || hasOpenIncident) return 'medical_validation_pending'
  if (new Date(episode.valid_until).getTime() < Date.now()) return 'expired'
  return 'open'
}

export const GET: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return unauthorized()

  const admin = untypedAdmin(locals)

  try {
    const { data: episodes, error: episodesError } = await admin
      .from('care_episodes')
      .select('id, doctor_id, source_appointment_id, status, patient_visible_label, included_ceeds_reviews, used_ceeds_reviews, valid_until, opened_at, closed_at')
      .eq('patient_id', context.patientId)
      .in('status', ['open', 'closure_pending', 'closed', 'escalated'])
      .order('opened_at', { ascending: false })
      .limit(5) as { data: CareEpisodeRow[] | null; error: { message: string } | null }

    if (episodesError) {
      logger.error('[clinical-closure/status] care episode query failed', { error: episodesError.message })
      return internalError()
    }

    if (!episodes?.length) {
      return jsonOk({ status: 'none', episode: null })
    }

    const episodeIds = episodes.map((episode) => episode.id)
    const { data: incidents, error: incidentsError } = await admin
      .from('clinical_incidents')
      .select('id, care_episode_id, condition_display, severity, status, sla_deadline')
      .in('care_episode_id', episodeIds)
      .order('sla_deadline', { ascending: true }) as { data: ClinicalIncidentRow[] | null; error: { message: string } | null }

    if (incidentsError) {
      logger.error('[clinical-closure/status] incident query failed', { error: incidentsError.message })
      return internalError()
    }

    const latest = episodes[0]
    const episodeIncidents = (incidents ?? []).filter((incident) => incident.care_episode_id === latest.id)
    const status = patientStatusForEpisode(latest, episodeIncidents)

    return jsonOk({
      status,
      episode: {
        id: latest.id,
        label: latest.patient_visible_label,
        appointmentId: latest.source_appointment_id,
        doctorId: latest.doctor_id,
        includedReviews: latest.included_ceeds_reviews,
        usedReviews: latest.used_ceeds_reviews,
        validUntil: latest.valid_until,
        openedAt: latest.opened_at,
        closedAt: latest.closed_at,
        incidents: episodeIncidents.map((incident) => ({
          id: incident.id,
          condition: incident.condition_display,
          severity: incident.severity,
          status: incident.status,
          slaDeadline: incident.sla_deadline,
        })),
      },
    })
  } catch (error) {
    logger.error('[clinical-closure/status] GET failed', error)
    return internalError()
  }
}
