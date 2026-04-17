/**
 * CQRS Read Model: Doctor Open Slots
 *
 * Read-only query that resolves the doctor's timezone and returns
 * the list of slots available (or overbook-eligible) in a date range.
 *
 * Delegates slot computation to @autamedica/scheduling's getOpenSlots,
 * but owns the doctor lookup so the controller stays slim.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getOpenSlots } from '@autamedica/scheduling'
import type { ScheduleSlot, UUID } from '@autamedica/types'
import { logger } from '@autamedica/shared'

export interface DoctorSlotsQueryParams {
  dateFrom: string
  dateTo: string
}

export class DoctorNotFoundError extends Error {
  constructor(doctorId: string) {
    super(`Doctor not found: ${doctorId}`)
    this.name = 'DoctorNotFoundError'
  }
}

interface DoctorTimezoneRow {
  id: string
  timezone?: string | null
}

export async function queryDoctorSlots(
  supabase: SupabaseClient,
  doctorId: string,
  params: DoctorSlotsQueryParams,
): Promise<ScheduleSlot[]> {
  const { data, error } = await supabase
    .from('doctors')
    .select('id, timezone')
    .eq('id', doctorId)
    .maybeSingle()

  if (error) {
    logger.error('[query:doctor-slots] doctor lookup failed', error)
    throw error
  }

  const doctor = data as DoctorTimezoneRow | null
  if (!doctor) {
    throw new DoctorNotFoundError(doctorId)
  }

  const timezone = typeof doctor.timezone === 'string' ? doctor.timezone : undefined

  return getOpenSlots(supabase, {
    doctor_id: doctorId as UUID,
    date_from: params.dateFrom,
    date_to: params.dateTo,
    timezone,
  })
}
