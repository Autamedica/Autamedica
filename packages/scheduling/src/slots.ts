/**
 * Slot Generator — Genera slots disponibles a partir de la disponibilidad del doctor.
 *
 * Lee doctor_availability + doctor_availability_overrides,
 * resta appointments existentes, retorna solo slots libres.
 * Evalúa probabilidad de no-show para marcar slots como overbook_eligible.
 *
 * All slot timestamps use explicit UTC-3 (Argentina Standard Time) offset
 * to avoid implicit local-timezone issues during DST transitions in other locales.
 */

import type {
  DoctorAvailability,
  AvailabilityOverride,
  ScheduleSlot,
  SlotQuery,
} from '@autamedica/types';
import { logger } from '@autamedica/shared';
import type { SupabaseLike } from './supabase';
import { predictNoShowProbability } from './noshow-predictor';

/** Argentina Standard Time offset (UTC-3). Argentina doesn't observe DST. */
const ART_OFFSET = '-03:00';

/** Probabilidad de no-show por encima de la cual se permite overbooking */
const OVERBOOKING_THRESHOLD = 0.3;

/**
 * Resolve the current UTC offset for any IANA timezone using Intl.
 * Handles DST automatically (e.g. America/New_York → -05:00 or -04:00).
 */
function resolveOffset(timezone?: string | null): string {
  if (!timezone || timezone === 'UTC') return timezone === 'UTC' ? '+00:00' : ART_OFFSET;
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const tzPart = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
    // Format: "GMT-3" or "GMT+5:30" → normalize to "-03:00" or "+05:30"
    const match = tzPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match?.[1] || !match[2]) return ART_OFFSET;
    const sign = match[1];
    const hours = match[2].padStart(2, '0');
    const minutes = match[3] ?? '00';
    return `${sign}${hours}:${minutes}`;
  } catch {
    return ART_OFFSET;
  }
}

/**
 * Genera todos los slots disponibles para un doctor en un rango de fechas.
 *
 * 1. Lee disponibilidad semanal recurrente (doctor_availability)
 * 2. Aplica overrides puntuales (doctor_availability_overrides)
 * 3. Resta citas existentes (appointments activas)
 * 4. Evalúa no-show para detectar slots overbookables
 * 5. Retorna slots con flag overbook_eligible
 */
export async function getAvailableSlots(
  supabase: SupabaseLike,
  query: SlotQuery,
): Promise<ScheduleSlot[]> {
  const { doctor_id, date_from, date_to, appointment_type: _appointment_type, timezone } = query;
  const utcOffset = resolveOffset(timezone);

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

  // 3. Fetch existing appointments (include patient_id for no-show prediction)
  const { data: appointments, error: apptErr } = await supabase
    .from('appointments')
    .select('start_time, end_time, duration_minutes, status, patient_id')
    .eq('doctor_id', doctor_id)
    .gte('start_time', `${date_from}T00:00:00`)
    .lte('start_time', `${date_to}T23:59:59`)
    .not('status', 'in', '("cancelled","no_show")');

  if (apptErr) throw new Error(`Error fetching appointments: ${apptErr.message}`);

  // 4. Generate slots with overbooking analysis
  const overrideMap = buildOverrideMap(overrides ?? []);
  const rawAppointments: AppointmentRow[] = appointments ?? [];
  const bookedSlots = buildBookedSet(rawAppointments);
  const overbookableRanges = await computeOverbookableRanges(supabase, rawAppointments, doctor_id);

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
      const overrideSlots = generateSlotsForTimeRange(
        doctor_id, dateStr,
        override.start_time ?? '00:00', override.end_time ?? '23:59',
        30, null, bookedSlots, overbookableRanges, utcOffset,
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
        doctor_id, dateStr,
        avail.start_time, avail.end_time,
        avail.slot_duration, avail.location,
        bookedSlots, overbookableRanges, utcOffset,
      );
      slots.push(...daySlots);
    }
  }

  return slots;
}

/**
 * Retorna slots disponibles o elegibles para overbooking.
 * Un slot overbook_eligible está ocupado pero la cita existente tiene alta probabilidad de no-show.
 */
export async function getOpenSlots(
  supabase: SupabaseLike,
  query: SlotQuery,
): Promise<ScheduleSlot[]> {
  const all = await getAvailableSlots(supabase, query);
  return all.filter((s) => s.is_available || s.overbook_eligible);
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

interface AppointmentRow {
  start_time: string;
  end_time: string | null;
  duration_minutes: number | null;
  status: string;
  patient_id: string;
}

function buildBookedSet(appointments: AppointmentRow[]): BookedRange[] {
  return appointments.map((a) => {
    const start = new Date(a.start_time).getTime();
    const end = a.end_time
      ? new Date(a.end_time).getTime()
      : start + (a.duration_minutes ?? 30) * 60 * 1000;
    return { start, end };
  });
}

/**
 * Evalúa predicción de no-show para cada cita existente.
 * Retorna rangos horarios donde la probabilidad supera el umbral de overbooking.
 */
async function computeOverbookableRanges(
  supabase: SupabaseLike,
  appointments: AppointmentRow[],
  doctorId: string,
): Promise<BookedRange[]> {
  if (appointments.length === 0) return [];

  const ranges: BookedRange[] = [];
  const uniquePatients = [...new Set(appointments.map((a) => a.patient_id))];
  const predictionCache = new Map<string, number>();

  await Promise.all(
    uniquePatients.map(async (patientId) => {
      const appt = appointments.find((a) => a.patient_id === patientId);
      if (!appt) return;
      const dt = new Date(appt.start_time);
      const prediction = await predictNoShowProbability(
        supabase, patientId, doctorId, dt.getDay(), dt.getHours(),
      );
      predictionCache.set(patientId, prediction.probability);
    }),
  );

  for (const appt of appointments) {
    const probability = predictionCache.get(appt.patient_id) ?? 0;
    if (probability > OVERBOOKING_THRESHOLD) {
      const start = new Date(appt.start_time).getTime();
      const end = appt.end_time
        ? new Date(appt.end_time).getTime()
        : start + (appt.duration_minutes ?? 30) * 60 * 1000;

      logger.info(
        `[scheduling] Slot overbookable: paciente=${appt.patient_id} probabilidad=${(probability * 100).toFixed(0)}% (umbral=${OVERBOOKING_THRESHOLD * 100}%)`,
      );
      ranges.push({ start, end });
    }
  }

  return ranges;
}

function generateSlotsForTimeRange(
  doctorId: string,
  dateStr: string,
  startTime: string,
  endTime: string,
  slotDuration: number,
  location: string | null,
  bookedSlots: BookedRange[],
  overbookableRanges: BookedRange[],
  offset: string = ART_OFFSET,
): ScheduleSlot[] {
  const slots: ScheduleSlot[] = [];

  const startParts = startTime.split(':').map(Number);
  const endParts = endTime.split(':').map(Number);
  const startH = startParts[0] ?? 0;
  const startM = startParts[1] ?? 0;
  const endH = endParts[0] ?? 0;
  const endM = endParts[1] ?? 0;

  const dayStart = new Date(`${dateStr}T${pad(startH)}:${pad(startM)}:00${offset}`);
  const dayEnd = new Date(`${dateStr}T${pad(endH)}:${pad(endM)}:00${offset}`);

  let cursor = dayStart.getTime();
  const endMs = dayEnd.getTime();
  const durationMs = slotDuration * 60 * 1000;

  while (cursor + durationMs <= endMs) {
    const slotStart = cursor;
    const slotEnd = cursor + durationMs;

    const isBooked = bookedSlots.some(
      (b) => b.start < slotEnd && b.end > slotStart,
    );

    const isOverbookEligible = isBooked && overbookableRanges.some(
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
      overbook_eligible: isOverbookEligible,
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
