import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Appointment } from '@autamedica/types'
import { logger } from '@autamedica/shared'

type Db = SupabaseClient<Database>

export async function listDoctorAppointmentsView(
  supabase: Db,
  doctorId: string,
): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('doctor_id', doctorId)
    .is('deleted_at', null)
    .order('start_time', { ascending: true })

  if (error) {
    logger.error('[doctorAppointments.query] list failed', error)
    throw error
  }

  return (data ?? []) as Appointment[]
}
