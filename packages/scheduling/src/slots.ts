/**
 * Slot Generator — Genera slots disponibles a partir de la disponibilidad del doctor.
 *
 * Lee doctor_availability + doctor_availability_overrides,
 * resta appointments existentes, retorna solo slots libres.
 */

import type {
  DoctorAvailability,
  AvailabilityOverride,
  ScheduleSlot,
  SlotQuery,
} from '@autamedica/types';
import type { SupabaseLike } from './supabase';

/**
 * Genera todos los slots disponibles para un doctor en un rango de fechas.
 *
 * 1. Lee disponibilidad semanal recurrente (doctor_availability)
 * 2. Aplica overrides puntuales (doctor_availability_overrides)
 * 3. Resta citas existentes (appointments activas)
 * 4. Retorna solo slots libres
 */
export async function getAvailableSlots(
  supabase: SupabaseLike,
  query: SlotQuery,
): Promise<ScheduleSlot[]> {
  const { doctor_id, date_from, date_to, appointment_type: _appointment_type } = query;

  // 1. Fetch weekly availability
  const { data: availability, error: availErr } = await supabase
    .from('doctor_availability')
    .select('*')
    .eq('doctor_id', doctor_id)
    .eq('is_active', true);

  if (availErr) throw new Error(`Error fetching availability: ${availErr.message}`);
  if (!availability || availability.length === 0) return [];

  // 2. Fetch overrides for the date range
  const { data: overrides, error: overErr } = await supabase
    .from('doctor_availability_overrides')
    .select('*')
    .eq('doctor_id', doctor_id)
    .gte('override_date', date_from)
    .lte('override_date', date_to);

  if (overErr) throw new Error(`Error fetching overrides: ${overErr.message}`);

  // 3. Fetch existing appointments in the date range
  const { data: appointments, error: apptErr } = await supabase
    .from('appointments')
    .select('start_time, end_time, duration_minutes, status')
    .eq('doctor_id', doctor_id)
    .gte('start_time', `${date_from}T00:00:00`)
    .lte('start_time', `${date_to}T23:59:59`)
    .not('status', 'in', '("cancelled","no_show")');

  if (apptErr) throw new Error(`Error fetching appointments: ${apptErr.message}`);

  // 4. Generate slots
  const overrideMap = buildOverrideMap(overrides ?? []);
  const bookedSlots = buildBookedSet(appointments ?? []);

  const slots: ScheduleSlot[] = [];
  const startDate = new Date(date_from);
  const endDate = new Date(date_to);

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = formatDate(d);
    const dayOfWeek = d.getDay(); // 0=sunday

    // Check override first
    const override = overrideMap.get(dateStr);
    if (override) {
      if (!override.is_available) continue; // Doctor off this day
      // Use override hours instead of weekly schedule
      const overrideSlots = generateSlotsForTimeRange(
        doctor_id,
        dateStr,
        override.start_time ?? '00:00',
        override.end_time ?? '23:59',
        30, // default duration for overrides
        null,
        bookedSlots,
      );
      slots.push(...overrideSlots);
      continue;
    }

    // Use weekly schedule
    const dayAvailabilities = (availability as DoctorAvailability[]).filter(
      (a) => a.day_of_week === dayOfWeek,
    );

    for (const avail of dayAvailabilities) {
      const daySlots = generateSlotsForTimeRange(
        doctor_id,
        dateStr,
        avail.start_time,
        avail.end_time,
        avail.slot_duration,
        avail.location,
        bookedSlots,
      );
      slots.push(...daySlots);
    }
  }

  return slots;
}

/**
 * Retorna slots disponibles solo (filtro de conveniencia)
 */
export async function getOpenSlots(
  supabase: SupabaseLike,
  query: SlotQuery,
): Promise<ScheduleSlot[]> {
  const all = await getAvailableSlots(supabase, query);
  return all.filter((s) => s.is_available);
}

// ==========================================
// Internal helpers
// ==========================================

function buildOverrideMap(overrides: AvailabilityOverride[]): Map<string, AvailabilityOverride> {
  const map = new Map<string, AvailabilityOverride>();
  for (const o of overrides) {
    map.set(o.override_date, o);
  }
  return map;
}

interface BookedRange {
  start: number; // timestamp ms
  end: number;
}

function buildBookedSet(
  appointments: Array<{
    start_time: string;
    end_time: string | null;
    duration_minutes: number | null;
    status: string;
  }>,
): BookedRange[] {
  return appointments.map((a) => {
    const start = new Date(a.start_time).getTime();
    const end = a.end_time
      ? new Date(a.end_time).getTime()
      : start + (a.duration_minutes ?? 30) * 60 * 1000;
    return { start, end };
  });
}

function generateSlotsForTimeRange(
  doctorId: string,
  dateStr: string,
  startTime: string,
  endTime: string,
  slotDuration: number,
  location: string | null,
  bookedSlots: BookedRange[],
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];

  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  const startH = startParts[0] ?? 0;
  const startM = startParts[1] ?? 0;
  const endH = endParts[0] ?? 0;
  const endM = endParts[1] ?? 0;

  const dayStart = new Date(`${dateStr}T${pad(startH)}:${pad(startM)}:00`);
  const dayEnd = new Date(`${dateStr}T${pad(endH)}:${pad(endM)}:00`);

  let cursor = dayStart.getTime();
  const endMs = dayEnd.getTime();
  const durationMs = slotDuration * 60 * 1000;

  while (cursor + durationMs <= endMs) {
    const slotStart = cursor;
    const slotEnd = cursor + durationMs;

    const isBooked = bookedSlots.some(
      (b) => b.start < slotEnd && b.end > slotStart,
    );

    slots.push({
      doctor_id: doctorId as import('@autamedica/types').UUID,
      date: dateStr,
      start_time: new Date(slotStart).toISOString(),
      end_time: new Date(slotEnd).toISOString(),
      duration_minutes: slotDuration,
      location,
      is_available: !isBooked,
    });

    cursor += durationMs;
  }

  return slots;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
