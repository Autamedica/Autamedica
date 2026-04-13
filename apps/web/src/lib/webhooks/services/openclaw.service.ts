/**
 * Service: OpenClaw webhook business logic.
 * Orchestrates repo queries and scheduling package functions.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@autamedica/shared'
import {
  processReminderResponse,
  processWaitlist,
  acceptWaitlistOffer,
} from '@autamedica/scheduling'
import { openclawRepo } from '../repos/openclaw.repo'

type AdminClient = SupabaseClient

export interface WebhookResult {
  action: string
  reminder_id?: string
  appointment_id?: string
  waitlist_id?: string
}

export const openclawService = {
  async handleConfirmOrCancel(
    admin: AdminClient,
    phone: string,
    response: 'confirmed' | 'cancelled',
  ): Promise<WebhookResult> {
    const patientId = await openclawRepo.findPatientIdByPhone(admin, phone)
    if (!patientId) {
      logger.warn(`[openclaw] No patient found for ${phone}`)
      return { action: 'no_reminder_found' }
    }

    const reminder = await openclawRepo.findActiveReminderForPatient(admin, patientId)
    if (!reminder) {
      logger.warn(`[openclaw] No active reminder found for ${phone}`)
      return { action: 'no_reminder_found' }
    }

    await processReminderResponse(admin, reminder.id, response)

    if (response === 'cancelled' && reminder.appointment_id) {
      const slot = await openclawRepo.getAppointmentSlot(admin, reminder.appointment_id)
      if (slot) {
        await processWaitlist(admin, slot.doctor_id, {
          date: slot.start_time.split('T')[0],
          start_time: slot.start_time,
          end_time: slot.end_time,
        }).catch((err) => logger.error('[openclaw] processWaitlist failed', err))
      }
    }

    return { action: response, reminder_id: reminder.id }
  },

  async handleWaitlistAcceptance(
    admin: AdminClient,
    phone: string,
  ): Promise<WebhookResult> {
    const patientId = await openclawRepo.findPatientIdByPhone(admin, phone)
    if (!patientId) throw new Error('Patient not found for phone')

    const offer = await openclawRepo.findActiveWaitlistOffer(admin, patientId)
    if (!offer) throw new Error('No active waitlist offer found')

    const result = await acceptWaitlistOffer(admin, offer.id, {
      start_time: offer.offered_start_time ?? new Date().toISOString(),
      end_time: offer.offered_end_time ?? new Date().toISOString(),
      type: offer.appointment_type ?? undefined,
    })

    return {
      action: 'waitlist_accepted',
      appointment_id: result.appointment_id,
      waitlist_id: offer.id,
    }
  },
}
