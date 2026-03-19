/**
 * Conflict Detection — Verifica conflictos de citas y encuentra próximos slots libres.
 *
 * Complementa el trigger de DB check_appointment_conflict() con validación client-side
 * para UX inmediata antes de intentar el INSERT.
 */

import type { SupabaseLike } from './supabase';

/**
 * Verifica si hay conflicto con una cita existente para un doctor en un rango de tiempo.
 * Retorna true si HAY conflicto (el slot NO está disponible).
 */
export async function checkConflict(
  supabase: SupabaseLike,
  doctorId: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('doctor_id', doctorId)
    .not('status', 'in', '("cancelled","no_show")')
    .lt('start_time', endTime)
    .gt('end_time', startTime)
    .limit(1);

  if (error) throw new Error(`Error checking conflict: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

/**
 * Encuentra el próximo slot disponible para un doctor después de una fecha dada.
 * Busca en los próximos 14 días por defecto.
 */
export async function findNextAvailable(
  supabase: SupabaseLike,
  doctorId: string,
  afterDate: string,
  searchDays: number = 14,
): Promise<{ date: string; start_time: string; end_time: string } | null> {
  // Import dynamically to avoid circular dependency
  const { getOpenSlots } = await import('./slots');

  const dateFrom = new Date(afterDate);
  const dateTo = new Date(afterDate);
  dateTo.setDate(dateTo.getDate() + searchDays);

  const slots = await getOpenSlots(supabase, {
    doctor_id: doctorId as import('@autamedica/types').UUID,
    date_from: formatDate(dateFrom),
    date_to: formatDate(dateTo),
  });

  // Filter only future slots
  const now = new Date().toISOString();
  const futureSlots = slots.filter((s) => s.start_time > now);

  const first = futureSlots[0];
  if (!first) return null;

  return {
    date: first.date,
    start_time: first.start_time,
    end_time: first.end_time,
  };
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
