import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@autamedica/types'
import type { CallStatus } from '@autamedica/telemedicine'
import { callResponseRepo } from '@/lib/calls/repos/call-response.repo'
import {
  resolvePersistCallStatus,
  type PersistableCallStatus,
} from '@/lib/calls/services/call-status-rules'
import { decrementFreeConsultation } from '@/lib/calls/lib/consultation-credits'
import { decrementDoctorVideoconsulta } from '@/lib/calls/lib/doctor-videoconsulta-credits'
import { appointmentPaymentsService } from '@/lib/payments/services/appointment-payments.service'
import { logger, domainEvents } from '@autamedica/shared'

type Db = SupabaseClient<Database>

const CREDIT_RETRY_DELAYS = [0, 1_000, 3_000] // immediate, 1s, 3s

/** Non-blocking credit decrement with retry and audit trail */
async function retryDecrementCredits(admin: Db, callId: string, patientId: string): Promise<void> {
  for (let attempt = 0; attempt < CREDIT_RETRY_DELAYS.length; attempt++) {
    const delay = CREDIT_RETRY_DELAYS[attempt]
    if (delay > 0) await new Promise(r => setTimeout(r, delay))

    try {
      const consumed = await decrementFreeConsultation(admin, patientId)
      logger.info('[persist-call-status] Credit decrement result', {
        callId,
        patientId,
        consumed,
        attempt: attempt + 1,
      })
      return
    } catch (err) {
      logger.error('[persist-call-status] Credit decrement failed', {
        callId,
        patientId,
        attempt: attempt + 1,
        maxAttempts: CREDIT_RETRY_DELAYS.length,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  logger.error('[persist-call-status] AUDIT: Credit decrement exhausted all retries', {
    callId,
    patientId,
    totalAttempts: CREDIT_RETRY_DELAYS.length,
  })
}

interface CallStatusViewer {
  userId: string
  doctorProfileId: string | null
  patientProfileId: string | null
}

export interface PersistCallStatusRequest {
  callId: string
  status: PersistableCallStatus
  reason?: string
  viewer: CallStatusViewer
}

export interface PersistCallStatusResponse {
  callId: string
  roomId: string
  status: CallStatus
  changed: boolean
}

type PersistCallStatusOutcome =
  | { kind: 'ok'; data: PersistCallStatusResponse }
  | { kind: 'not_found'; message: string }
  | { kind: 'forbidden'; message: string }
  | { kind: 'conflict'; message: string }

function matchesParticipant(
  participantId: string | null,
  callParticipantId: string,
  userId: string,
): boolean {
  return callParticipantId === userId || (participantId !== null && callParticipantId === participantId)
}

export const persistCallStatusService = {
  async persist(
    admin: Db,
    actorSupabase: Db,
    input: PersistCallStatusRequest,
  ): Promise<PersistCallStatusOutcome> {
    const call = await callResponseRepo.findById(admin, input.callId)
    if (!call) {
      return { kind: 'not_found', message: 'call_not_found' }
    }

    const isDoctor = matchesParticipant(input.viewer.doctorProfileId, call.doctor_id, input.viewer.userId)
    const isPatient = matchesParticipant(input.viewer.patientProfileId, call.patient_id, input.viewer.userId)

    if (!isDoctor && !isPatient) {
      return { kind: 'forbidden', message: 'call_access_denied' }
    }

    const transition = resolvePersistCallStatus(input.status, call.status)
    if (transition.kind === 'conflict') {
      return transition
    }

    if (!transition.changed) {
      return {
        kind: 'ok',
        data: {
          callId: call.id,
          roomId: call.room_id,
          status: transition.effectiveStatus,
          changed: false,
        },
      }
    }

    const updated = await callResponseRepo.updateCallStatus(
      actorSupabase,
      call.id,
      input.status,
      input.reason,
    )

    if (!updated) {
      // Another participant may have committed the same transition while this
      // request waited for the row lock. Only the winning update consumes credits.
      const latest = await callResponseRepo.findById(admin, call.id)
      if (latest?.status === input.status) {
        return {
          kind: 'ok',
          data: { callId: latest.id, roomId: latest.room_id, status: latest.status, changed: false },
        }
      }
      return { kind: 'conflict', message: 'call_status_changed_concurrently' }
    }

    // Decrement credits when a call ends (with retry + audit)
    if (input.status === 'ended') {
      if (call.patient_id) {
        retryDecrementCredits(admin, call.id, call.patient_id)
      }
      // Decrement doctor free videoconsulta credits (skips if has Pro/Premium subscription)
      void decrementDoctorVideoconsulta(admin, call.doctor_id).catch((err) => {
        logger.error('[persist-call-status] Doctor videoconsulta credit decrement failed', {
          callId: call.id,
          doctorId: call.doctor_id,
          error: err instanceof Error ? err.message : String(err),
        })
      })

      if (call.appointment_id) {
        void appointmentPaymentsService.createDoctorEarningForAppointment(admin, call.appointment_id).catch((err) => {
          logger.error('[persist-call-status] Doctor earning creation failed', {
            callId: call.id,
            appointmentId: call.appointment_id,
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }

      // Emit domain event once, at the canonical transition point.
      // Duration is measured from accepted_at (first join) with created_at as fallback.
      try {
        const startTs = call.accepted_at ?? call.created_at
        const startMs = startTs ? Date.parse(startTs) : NaN
        const durationSeconds = Number.isFinite(startMs)
          ? Math.max(0, Math.round((Date.now() - startMs) / 1000))
          : 0

        await domainEvents.emit('call.ended', {
          callId: call.id,
          roomId: call.room_id,
          durationSeconds,
        })
      } catch (err) {
        logger.warn('[persist-call-status] call.ended emit failed', {
          callId: call.id,
          error: err instanceof Error ? err.message : err,
        })
      }
    }

    return {
      kind: 'ok',
      data: {
        callId: call.id,
        roomId: call.room_id,
        status: transition.effectiveStatus,
        changed: true,
      },
    }
  },
}

