import type { SupabaseLike } from './supabase';

export async function markOverdueAppointmentsNoShow(
  supabase: SupabaseLike,
): Promise<number> {
  const { data, error } = await supabase.rpc('mark_overdue_appointments_no_show');

  if (error) {
    throw new Error(`Error marking overdue appointments as no_show: ${error.message}`);
  }

  return typeof data === 'number' ? data : 0;
}
