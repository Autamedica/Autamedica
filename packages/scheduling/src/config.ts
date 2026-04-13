import type { DoctorSchedulingConfig, SchedulingConfig } from '@autamedica/types';
import { DEFAULT_SCHEDULING_CONFIG } from '@autamedica/types';
import type { SupabaseLike } from './supabase';

function normalizeConfig(
  row: Partial<DoctorSchedulingConfig> | null | undefined,
): SchedulingConfig {
  return {
    reminder_hours_before: row?.reminder_hours_before ?? DEFAULT_SCHEDULING_CONFIG.reminder_hours_before,
    waitlist_offer_expiry_hours:
      row?.waitlist_offer_expiry_hours ?? DEFAULT_SCHEDULING_CONFIG.waitlist_offer_expiry_hours,
    noshow_overbooking_threshold:
      row?.noshow_overbooking_threshold ?? DEFAULT_SCHEDULING_CONFIG.noshow_overbooking_threshold,
    noshow_grace_minutes: row?.noshow_grace_minutes ?? DEFAULT_SCHEDULING_CONFIG.noshow_grace_minutes,
    max_advance_booking_days: DEFAULT_SCHEDULING_CONFIG.max_advance_booking_days,
    min_advance_booking_minutes: DEFAULT_SCHEDULING_CONFIG.min_advance_booking_minutes,
  };
}

export async function getDoctorSchedulingConfig(
  supabase: SupabaseLike,
  doctorId: string,
): Promise<SchedulingConfig> {
  const { data, error } = await supabase
    .from('doctor_scheduling_config')
    .select('reminder_hours_before, waitlist_offer_expiry_hours, noshow_overbooking_threshold, noshow_grace_minutes')
    .eq('doctor_id', doctorId)
    .maybeSingle();

  if (error) {
    return DEFAULT_SCHEDULING_CONFIG;
  }

  return normalizeConfig(data as Partial<DoctorSchedulingConfig> | null);
}
