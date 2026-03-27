/**
 * Use Case: Start Teleconsultation
 *
 * Orquesta el inicio de una videollamada médica:
 * 1. Verifica que el turno existe y está confirmado
 * 2. Crea el registro de llamada
 * 3. Emite evento de dominio
 *
 * Diseñado para ser invocado desde el controller (API route).
 */

import type { IEventBus } from '@autamedica/shared'
import { logger } from '@autamedica/shared'
import type { SupabaseClient } from '@supabase/supabase-js'

interface StartTeleconsultationInput {
  appointmentId: string
  doctorId: string
  patientId: string
  roomId: string
}

interface StartTeleconsultationResult {
  kind: 'ok' | 'not_found' | 'invalid_status' | 'error'
  callId?: string
  message?: string
}

interface StartTeleconsultationDeps {
  supabase: SupabaseClient
  eventBus: IEventBus
}

export async function startTeleconsultation(
  deps: StartTeleconsultationDeps,
  input: StartTeleconsultationInput
): Promise<StartTeleconsultationResult> {
  const { supabase, eventBus } = deps
  const { appointmentId, doctorId, patientId, roomId } = input

  logger.info(`[usecase:start-teleconsultation] appointment=${appointmentId} room=${roomId}`)

  const { data: appointment, error: apptError } = await supabase
    .from('appointments')
    .select('id, status, doctor_id, patient_id')
    .eq('id', appointmentId)
    .single()

  if (apptError || !appointment) {
    return { kind: 'not_found', message: 'Appointment not found' }
  }

  const validStatuses = ['scheduled', 'confirmed']
  if (!validStatuses.includes(appointment.status ?? '')) {
    return {
      kind: 'invalid_status',
      message: `Appointment status "${appointment.status}" is not valid for starting a call`,
    }
  }

  const { data: call, error: callError } = await supabase
    .from('calls')
    .insert({
      room_id: roomId,
      doctor_id: doctorId,
      patient_id: patientId,
      appointment_id: appointmentId,
      status: 'requested',
    })
    .select('id')
    .single()

  if (callError || !call) {
    logger.error('[usecase:start-teleconsultation] Failed to create call:', callError)
    return { kind: 'error', message: 'Failed to create call record' }
  }

  await supabase
    .from('appointments')
    .update({ status: 'in-progress' })
    .eq('id', appointmentId)

  await eventBus.emit('call.started', {
    callId: call.id,
    roomId,
    doctorId,
    patientId,
  })

  return { kind: 'ok', callId: call.id }
}
