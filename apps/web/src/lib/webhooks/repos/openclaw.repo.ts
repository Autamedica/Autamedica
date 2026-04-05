/**
 * Repository: DB queries for OpenClaw webhook processing.
 * Isolates all Supabase queries from the webhook controller.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

type AdminClient = SupabaseClient

interface ReminderRef {
  id: string
  appointment_id: string | null
}

interface AppointmentSlot {
  doctor_id: string
  start_time: string
  end_time: string
}

interface WaitlistOffer {
  id: string
  preferred_date_start: string | null
  preferred_date_end: string | null
  appointment_type: string | null
}

export const openclawRepo = {
  async findPatientIdByPhone(admin: AdminClient, phone: string): Promise<string | null> {
    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id')
      .eq('phone', phone)
      .limit(1)

    if (!profiles?.length) return null

    const { data: patients } = await admin
      .from('patients')
      .select('id')
      .eq('user_id', profiles[0].user_id)
      .eq('active', true)
      .limit(1)

    return patients?.[0]?.id ?? null
  },

  async findActiveReminderForPatient(
    admin: AdminClient,
    patientId: string,
  ): Promise<ReminderRef | null> {
    const { data: appointments } = await admin
      .from('appointments')
      .select('id')
      .eq('patient_id', patientId)
      .in('status', ['scheduled', 'confirmed'])
      .gte('start_time', new Date().toISOString())
      .order('start_time', { ascending: true })

    if (!appointments?.length) return null

    const appointmentIds = appointments.map((a: { id: string }) => a.id)

    const { data: reminders } = await admin
      .from('appointment_reminders')
      .select('id, appointment_id')
      .in('appointment_id', appointmentIds)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)

    return (reminders?.[0] as ReminderRef | undefined) ?? null
  },

  async getAppointmentSlot(
    admin: AdminClient,
    appointmentId: string,
  ): Promise<AppointmentSlot | null> {
    const { data } = await admin
      .from('appointments')
      .select('doctor_id, start_time, end_time')
      .eq('id', appointmentId)
      .single()

    if (!data?.start_time || !data?.end_time) return null
    return data as AppointmentSlot
  },

  async findActiveWaitlistOffer(
    admin: AdminClient,
    patientId: string,
  ): Promise<WaitlistOffer | null> {
    const { data: offers } = await admin
      .from('appointment_waitlist')
      .select('id, preferred_date_start, preferred_date_end, appointment_type')
      .eq('patient_id', patientId)
      .eq('status', 'offered')
      .gt('expires_at', new Date().toISOString())
      .order('offered_at', { ascending: false })
      .limit(1)

    return (offers?.[0] as WaitlistOffer | undefined) ?? null
  },
}
