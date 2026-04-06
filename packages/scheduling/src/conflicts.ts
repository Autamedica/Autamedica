/**
 * Conflict Detection — Verifica conflictos de citas y encuentra próximos slots libres.
 *
 * Complementa el trigger de DB check_appointment_conflict() con validación client-side
 * para UX inmediata antes de intentar el INSERT.
 *
 * Soporta overbooking: si todas las citas en conflicto tienen alta probabilidad de no-show,
 * el conflicto se considera "soft" y se permite la reserva.
 */

import { logger } from '@autamedica/shared';
import type { SupabaseLike } from './supabase';
import { predictNoShowProbability } from './noshow-predictor';

const OVERBOOKING_THRESHOLD = 0.3;

export interface ConflictResult {
  hasConflict: boolean;
  overbookAllowed: boolean;
}

/**
 * Verifica si hay conflicto con una cita existente para un doctor en un rango de tiempo.
 * Retorna true si HAY conflicto real (el slot NO está disponible y no es overbookable).
 */
export async function checkConflict(
  supabase: SupabaseLike,
  doctorId: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const result = await checkConflictWithOverbook(supabase, doctorId, startTime, endTime);
  return result.hasConflict && !result.overbookAllowed;
}

/**
 * Verifica conflicto con detalle de overbooking.
 * Permite que el caller distinga entre conflicto duro y overbookable.
 */
export async function checkConflictWithOverbook(
  supabase: SupabaseLike,
  doctorId: string,
  startTime: string,
  endTime: string,
): Promise<ConflictResult> {
  const { data, error } = await supabase
    .from('appointments')
    .select('id, patient_id, start_time')
    .eq('doctor_id', doctorId)
    .not('status', 'in', '("cancelled","no_show")')
    .lt('start_time', endTime)
    .gt('end_time', startTime);

  if (error) throw new Error(`Error checking conflict: ${error.message}`);

  if (!data || data.length === 0) {
    return { hasConflict: false, overbookAllowed: false };
  }

  // Check if all conflicting appointments have high no-show risk
  const predictions = await Promise.all(
    data.map(async (appt: { id: string; patient_id: string; start_time: string }) => {
      const dt = new Date(appt.start_time);
      return predictNoShowProbability(
        supabase, appt.patient_id, doctorId, dt.getDay(), dt.getHours(),
      );
    }),
  );

  const allHighRisk = predictions.every((p) => p.probability > OVERBOOKING_THRESHOLD);

  if (allHighRisk) {
    logger.info(
      `[scheduling] Overbooking permitido: doctor=${doctorId} slot=${startTime} — ` +
      `${data.length} cita(s) en conflicto con alta probabilidad de no-show`,
    );
  }

  return { hasConflict: true, overbookAllowed: allHighRisk };
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
