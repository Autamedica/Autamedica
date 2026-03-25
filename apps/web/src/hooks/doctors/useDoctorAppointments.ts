/**
 * App-level wrapper: encapsulates browser Supabase client + @autamedica/hooks useAppointments.
 * Components should use this instead of managing supabaseClient state themselves.
 */
import { useEffect, useState } from 'react'
import { useAppointments } from '@autamedica/hooks'
import { getBrowserSupabaseClient } from '@/lib/supabase-browser'

export function useDoctorAppointments(doctorId?: string) {
  const [supabaseClient, setSupabaseClient] = useState<ReturnType<typeof getBrowserSupabaseClient> | null>(null)

  useEffect(() => {
    setSupabaseClient(getBrowserSupabaseClient())
  }, [])

  const result = useAppointments(supabaseClient, doctorId)

  return {
    ...result,
    isClientReady: supabaseClient !== null,
  }
}
