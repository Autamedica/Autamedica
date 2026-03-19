/**
 * No-Show Predictor — Predicción estadística de no-show.
 *
 * Calcula la probabilidad de que un paciente no asista a una cita
 * basándose en datos históricos. Sin ML externo — puro cálculo
 * estadístico con datos de appointment_history.
 *
 * Factores considerados:
 * - Tasa histórica de no-show del paciente
 * - Tasa global de no-show del doctor
 * - Día de la semana (lunes vs viernes)
 * - Hora del día (mañana vs tarde)
 * - Tipo de cita
 */

import type { NoShowPrediction, NoShowFactor } from '@autamedica/types';
import type { SupabaseLike } from './supabase';

/**
 * Predice la probabilidad de no-show para una combinación
 * paciente/doctor/día/hora.
 */
export async function predictNoShowProbability(
  supabase: SupabaseLike,
  patientId: string,
  doctorId: string,
  dayOfWeek: number,
  hour: number,
): Promise<NoShowPrediction> {
  const [patientStats, doctorStats, dayStats] = await Promise.all([
    getPatientNoShowRate(supabase, patientId),
    getDoctorNoShowRate(supabase, doctorId),
    getDayHourNoShowRate(supabase, doctorId, dayOfWeek, hour),
  ]);

  const factors: NoShowFactor[] = [];

  // Factor 1: Patient history (weight: 0.5)
  factors.push({
    name: 'patient_history',
    weight: 0.5,
    value: patientStats.rate,
    description: `Paciente: ${patientStats.noShows}/${patientStats.total} no-shows (${(patientStats.rate * 100).toFixed(0)}%)`,
  });

  // Factor 2: Doctor's global rate (weight: 0.2)
  factors.push({
    name: 'doctor_global_rate',
    weight: 0.2,
    value: doctorStats.rate,
    description: `Doctor: tasa global ${(doctorStats.rate * 100).toFixed(0)}%`,
  });

  // Factor 3: Day/hour pattern (weight: 0.3)
  factors.push({
    name: 'day_hour_pattern',
    weight: 0.3,
    value: dayStats.rate,
    description: `Patrón día/hora: ${(dayStats.rate * 100).toFixed(0)}%`,
  });

  // Weighted average
  const probability = factors.reduce((sum, f) => sum + f.weight * f.value, 0);

  // Clamp to 0-1
  const clampedProbability = Math.max(0, Math.min(1, probability));

  return {
    patient_id: patientId as import('@autamedica/types').UUID,
    doctor_id: doctorId as import('@autamedica/types').UUID,
    probability: clampedProbability,
    risk_level: clampedProbability >= 0.4 ? 'high' : clampedProbability >= 0.2 ? 'medium' : 'low',
    factors,
  };
}

// ==========================================
// Data fetchers
// ==========================================

interface NoShowStats {
  total: number;
  noShows: number;
  rate: number;
}

const BASE_RATE = 0.15; // 15% baseline when no data

async function getPatientNoShowRate(
  supabase: SupabaseLike,
  patientId: string,
): Promise<NoShowStats> {
  const { data, error } = await supabase
    .from('appointment_history')
    .select('action')
    .eq('patient_id', patientId)
    .in('action', ['completed', 'no_show', 'cancelled']);

  if (error || !data || data.length === 0) {
    return { total: 0, noShows: 0, rate: BASE_RATE };
  }

  const total = data.length;
  const noShows = data.filter((d: { action: string }) => d.action === 'no_show').length;

  // Bayesian smoothing: add prior to avoid extreme values with few data points
  const smoothedRate = (noShows + BASE_RATE * 5) / (total + 5);

  return { total, noShows, rate: smoothedRate };
}

async function getDoctorNoShowRate(
  supabase: SupabaseLike,
  doctorId: string,
): Promise<NoShowStats> {
  const { data, error } = await supabase
    .from('appointment_history')
    .select('action')
    .eq('doctor_id', doctorId)
    .in('action', ['completed', 'no_show']);

  if (error || !data || data.length === 0) {
    return { total: 0, noShows: 0, rate: BASE_RATE };
  }

  const total = data.length;
  const noShows = data.filter((d: { action: string }) => d.action === 'no_show').length;

  const smoothedRate = (noShows + BASE_RATE * 10) / (total + 10);

  return { total, noShows, rate: smoothedRate };
}

async function getDayHourNoShowRate(
  supabase: SupabaseLike,
  doctorId: string,
  _dayOfWeek: number,
  _hour: number,
): Promise<NoShowStats> {
  // For day/hour analysis, we query history and filter by metadata
  // Since appointment_history stores start_time in metadata, we use that
  const { data, error } = await supabase
    .from('appointment_history')
    .select('action, metadata, created_at')
    .eq('doctor_id', doctorId)
    .in('action', ['completed', 'no_show'])
    .order('created_at', { ascending: false })
    .limit(500);

  if (error || !data || data.length === 0) {
    return { total: 0, noShows: 0, rate: BASE_RATE };
  }

  // Filter by day of week and approximate hour from metadata
  const filtered = data.filter((d: { metadata?: { new_start_time?: string } }) => {
    const startTimeStr = d.metadata?.new_start_time;
    if (!startTimeStr) return false;
    const dt = new Date(startTimeStr);
    return dt.getDay() === _dayOfWeek && dt.getHours() === _hour;
  });

  if (filtered.length < 3) {
    // Not enough data for this specific day/hour, use general rate
    return { total: 0, noShows: 0, rate: BASE_RATE };
  }

  const total = filtered.length;
  const noShows = filtered.filter((d: { action: string }) => d.action === 'no_show').length;

  return { total, noShows, rate: noShows / total };
}
