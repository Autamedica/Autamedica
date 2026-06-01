import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

type Query<T> = PromiseLike<{ data: T | null; error: { message?: string } | null }>

interface PaidAppointmentRow {
  id: string
  patient_id: string | null
  doctor_id: string | null
  start_time: string
  type: string | null
  payment: {
    id: string
    gross_amount: number
    currency: string
    status: string
    paid_at: string | null
  }[] | null
}

interface CareEpisodeRow {
  id: string
  source_appointment_id: string
  source_payment_id: string | null
  status: string
  included_ceeds_reviews: number
  used_ceeds_reviews: number
  funding_source: string
  valid_until: string
}

interface IncidentRow {
  id: string
  patient_id: string
  doctor_id: string
  status: string
  care_episode_id: string | null
  source_appointment_id: string | null
}

// New CEEDS economic tables are introduced by migration before generated DB types are refreshed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(supabase: Db): any {
  return supabase as unknown as { from: (table: string) => unknown }
}

function addDays(date: Date, days: number): string {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy.toISOString()
}

function safeClosurePoolAmount(grossAmount: number): number {
  return Math.max(0, Math.round(grossAmount * 0.15))
}

function metadata(input: Record<string, unknown>): Json {
  return input as Json
}

export const careEpisodesService = {
  async upsertForPaidAppointment(supabase: Db, appointmentId: string): Promise<CareEpisodeRow | null> {
    const query = db(supabase)
      .from('appointments')
      .select(`
        id,
        patient_id,
        doctor_id,
        start_time,
        type,
        payment:appointment_payments!appointment_payments_appointment_id_fkey(
          id,
          gross_amount,
          currency,
          status,
          paid_at
        )
      `)

    const { data: appointment, error } = await query.eq('id', appointmentId).maybeSingle() as Awaited<Query<PaidAppointmentRow>>
    if (error) {
      logger.error('[care-episodes] paid appointment lookup failed', { appointmentId, error })
      throw error
    }

    const approvedPayment = appointment?.payment?.find((payment) => payment.status === 'approved') ?? null
    if (!appointment?.patient_id || !appointment.doctor_id || !approvedPayment) {
      return null
    }

    const openedAt = approvedPayment.paid_at ?? new Date().toISOString()
    const appointmentStart = new Date(appointment.start_time)
    const validFrom = Number.isNaN(appointmentStart.getTime()) ? new Date(openedAt) : appointmentStart

    const upsert = db(supabase)
      .from('care_episodes')
      .upsert({
        patient_id: appointment.patient_id,
        doctor_id: appointment.doctor_id,
        source_appointment_id: appointment.id,
        source_payment_id: approvedPayment.id,
        status: 'open',
        included_ceeds_reviews: 1,
        used_ceeds_reviews: 0,
        funding_source: 'included_consultation',
        patient_visible_label: 'Consulta AutaMedica con revision de cierre incluida',
        pricing_model: 'episode_safe_closure',
        opened_at: openedAt,
        valid_until: addDays(validFrom, 14),
        metadata: metadata({
          appointment_type: appointment.type,
          patient_charge_strategy: 'included_in_initial_consultation',
          patient_billable_ceeds_review: false,
          safe_closure_pool_amount: safeClosurePoolAmount(approvedPayment.gross_amount),
          currency: approvedPayment.currency,
        }),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'source_appointment_id' })

    const { data, error: upsertError } = await upsert
      .select('id, source_appointment_id, source_payment_id, status, included_ceeds_reviews, used_ceeds_reviews, funding_source, valid_until')
      .single() as Awaited<Query<CareEpisodeRow>>

    if (upsertError) {
      logger.error('[care-episodes] care episode upsert failed', { appointmentId, error: upsertError })
      throw upsertError
    }

    return data
  },

  async recordClosureReviewForIncident(
    supabase: Db,
    input: {
      incidentId: string
      doctorUserId: string
      resolutionAllowed: boolean
      overrideUsed: boolean
    },
  ): Promise<void> {
    const incidentQuery = db(supabase)
      .from('clinical_incidents')
      .select('id, patient_id, doctor_id, status, care_episode_id, source_appointment_id')

    const { data: incident, error: incidentError } = await incidentQuery.eq('id', input.incidentId).maybeSingle() as Awaited<Query<IncidentRow>>
    if (incidentError) throw incidentError
    if (!incident) return

    let careEpisodeId = incident.care_episode_id
    let sourceAppointmentId = incident.source_appointment_id

    if (!careEpisodeId) {
      const episodeQuery = db(supabase)
        .from('care_episodes')
        .select('id, source_appointment_id, source_payment_id, status, included_ceeds_reviews, used_ceeds_reviews, funding_source, valid_until')

      const { data: episode, error: episodeError } = await episodeQuery
        .eq('patient_id', incident.patient_id)
        .eq('doctor_id', incident.doctor_id)
        .in('status', ['open', 'closure_pending'])
        .gte('valid_until', new Date().toISOString())
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle() as Awaited<Query<CareEpisodeRow>>

      if (episodeError) throw episodeError
      careEpisodeId = episode?.id ?? null
      sourceAppointmentId = episode?.source_appointment_id ?? sourceAppointmentId
    }

    if (!careEpisodeId) {
      logger.info('[care-episodes] no active care episode found for CEEDS incident', {
        incidentId: incident.id,
        patientId: incident.patient_id,
        doctorId: incident.doctor_id,
      })
      return
    }

    const nextEpisodeStatus = input.resolutionAllowed ? 'closed' : 'closure_pending'
    const workType = input.overrideUsed ? 'clinical_override_review' : 'ceeds_closure_review'
    const performedAt = new Date().toISOString()

    const updateIncident = db(supabase)
      .from('clinical_incidents')
      .update({
        care_episode_id: careEpisodeId,
        source_appointment_id: sourceAppointmentId,
        updated_at: performedAt,
      })

    const { error: linkError } = await updateIncident.eq('id', incident.id) as Awaited<Query<unknown>>
    if (linkError) throw linkError

    const episodeUpdate = db(supabase)
      .from('care_episodes')
      .update({
        status: nextEpisodeStatus,
        used_ceeds_reviews: input.resolutionAllowed ? 1 : 0,
        closed_at: input.resolutionAllowed ? performedAt : null,
        updated_at: performedAt,
      })

    const { error: episodeUpdateError } = await episodeUpdate.eq('id', careEpisodeId) as Awaited<Query<unknown>>
    if (episodeUpdateError) throw episodeUpdateError

    const workUnitUpsert = db(supabase)
      .from('doctor_clinical_work_units')
      .upsert({
        doctor_id: incident.doctor_id,
        patient_id: incident.patient_id,
        care_episode_id: careEpisodeId,
        clinical_incident_id: incident.id,
        source_appointment_id: sourceAppointmentId,
        work_type: workType,
        status: input.resolutionAllowed ? 'approved' : 'pending',
        minutes_estimated: input.overrideUsed ? 15 : 10,
        gross_internal_amount: 0,
        currency: 'ARS',
        funded_by: 'included_consultation',
        patient_billable: false,
        performed_at: input.resolutionAllowed ? performedAt : null,
        metadata: metadata({
          patient_visible_charge: false,
          doctor_user_id: input.doctorUserId,
          resolution_allowed: input.resolutionAllowed,
        }),
        updated_at: performedAt,
      }, { onConflict: 'care_episode_id,clinical_incident_id,work_type' })

    const { error: workUnitError } = await workUnitUpsert as Awaited<Query<unknown>>
    if (workUnitError) throw workUnitError
  },
}
