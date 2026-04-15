/**
 * Frontend Service: Doctor Dashboard Statistics
 * Business logic for aggregating appointments and medical records stats.
 * Layer 3 of 7-layer architecture.
 * Pure functions, no React imports.
 */
import { getBrowserSupabaseClient } from '@/lib/supabase-browser';
import { logger } from '@autamedica/shared';

export interface DoctorStats {
  activeCount: number;
  todayCount: number;
  patientsCount: number;
  historyCount: number;
  pendingClarifications: number;
  pendingTriageMandates: number;
  qualityScore?: number | null;
  qualityMessage?: string | null;
  rankingPosition?: number | null;
  unreadCommunityCount?: number;
  satisfactionRate?: number | null;
  avgRating?: number | null;
  avgConsultationTimeMins?: number | null;
  nextAppointment: {
    time: string;
    patientName: string;
  } | null;
}

interface AppointmentRow {
  id: string;
  start_time: string;
  end_time: string | null;
  status: string;
  patient_id: string;
}

interface ProfileRow {
  first_name: string | null;
  last_name: string | null;
}

/**
 * Resolve patient display name from patient ID.
 * Queries patients → profiles join.
 */
async function resolvePatientName(patientId: string): Promise<string> {
  const supabase = getBrowserSupabaseClient();

  const { data: patient, error: patientError } = await supabase
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .maybeSingle();

  if (patientError) {
    logger.warn('[doctor-stats] resolvePatientName patient lookup degraded', patientError);
    return 'Paciente';
  }

  if (!patient?.user_id) return 'Paciente';

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', patient.user_id)
    .maybeSingle();

  if (profileError) {
    logger.warn('[doctor-stats] resolvePatientName profile lookup degraded', profileError);
    return 'Paciente';
  }

  const prof = profile as ProfileRow | null;
  if (!prof) return 'Paciente';

  return `${prof.first_name ?? ''} ${prof.last_name ?? ''}`.trim() || 'Paciente';
}

/**
 * Helper to determine the quality message based on the score.
 */
function getQualityMessage(score: number | null | undefined): string {
  if (score == null) return 'Aún no tienes suficientes calificaciones para calcular tu puntuación de calidad.';
  const normalizedScore = score > 10 ? score / 10 : score;
  if (normalizedScore >= 9.0) return 'Excelente desempeño. Mantén la calidad de atención y el tiempo de respuesta.';
  if (normalizedScore >= 8.0) return 'Muy buen desempeño. Estás entre los mejores especialistas de la plataforma.';
  if (normalizedScore >= 7.0) return 'Buen desempeño. Considera reducir los tiempos de espera para mejorar tu puntuación.';
  return 'Oportunidad de mejora. Revisa los comentarios de los pacientes y tus tiempos de respuesta.';
}

/**
 * Get doctor stats: active appointments, today's appointments, unique patients, medical records count.
 * Returns next upcoming appointment with patient name resolved.
 */
export async function getDoctorStats(doctorId: string, userId?: string): Promise<DoctorStats> {
  const supabase = getBrowserSupabaseClient();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  const nowIso = now.toISOString();

  const [
    apptResult,
    patientsResult,
    recordsResult,
    rankingResult,
    notificationsResult,
    clarificationsResult,
    triageMandatesResult,
  ] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, start_time, end_time, status, patient_id')
      .eq('doctor_id', doctorId)
      .gte('start_time', startOfDay)
      .order('start_time', { ascending: true }),
    // Count unique patients from both care team and appointments
    Promise.all([
      supabase
        .from('patient_care_team')
        .select('patient_id')
        .eq('doctor_id', doctorId)
        .eq('active', true),
      supabase
        .from('appointments')
        .select('patient_id')
        .eq('doctor_id', doctorId),
    ]).then(([careResult, apptResult]) => {
      const careIds = (careResult.data ?? []).map((r: { patient_id: string }) => r.patient_id);
      const apptIds = (apptResult.data ?? [])
        .map((r: { patient_id: string }) => r.patient_id)
        .filter(Boolean);
      const uniqueCount = new Set([...careIds, ...apptIds]).size;
      return { count: uniqueCount, error: careResult.error || apptResult.error };
    }),
    supabase
      .from('medical_records')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId),
    supabase
      .from('doctor_ranking_metrics')
      .select('rank_position, overall_score, avg_rating')
      .eq('doctor_id', doctorId)
      .maybeSingle(),
    userId
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('portal_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('audience', 'doctor')
          .eq('category', 'community')
          .is('read_at', null)
      : Promise.resolve({ data: null, error: null, count: 0 }),
    // Pending clarifications: dispensation orders waiting for doctor response
    supabase
      .from('dispensation_orders')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('status', 'clarification_requested'),
    // Pending clinical triage mandates assigned to this doctor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('clinical_case_states')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_doctor_id', doctorId)
      .neq('triage_priority', 'routine')
      .in('triage_status', ['pending', 'acknowledged', 'in_progress']),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ]) as any[];

  if (apptResult.error) {
    logger.error('[doctor-stats] getDoctorStats failed', apptResult.error)
    throw apptResult.error
  }

  const appointments = (apptResult.data ?? []) as AppointmentRow[];

  const activeAppointments = appointments.filter(apt => apt.status === 'scheduled' || apt.status === 'in_progress');

  const todayAppointments = appointments.filter(apt => apt.start_time >= startOfDay && apt.start_time <= endOfDay);

  const nextAppt = appointments.find(apt => apt.start_time >= nowIso && (apt.status === 'scheduled' || apt.status === 'confirmed')) as AppointmentRow | undefined;

  const patientName = nextAppt?.patient_id ? await resolvePatientName(nextAppt.patient_id) : 'Paciente';

  const qualityScoreRaw = rankingResult?.data?.overall_score;
  const qualityScore = qualityScoreRaw != null ? (qualityScoreRaw > 10 ? qualityScoreRaw / 10 : qualityScoreRaw) : null;

  const avgRatingRaw = rankingResult?.data?.avg_rating;
  const avgRating = avgRatingRaw != null ? (avgRatingRaw > 5 ? avgRatingRaw / 20 : avgRatingRaw) : null;
  const satisfactionRate = avgRating != null ? Math.round((avgRating / 5) * 100) : null;

  // Calculate average consultation time based on completed appointments
  const completedAppointments = appointments.filter(apt => apt.status === 'ended' || apt.status === 'completed');
  let avgConsultationTimeMins: number | null = null;
  if (completedAppointments.length > 0) {
    let totalMinutes = 0;
    let validCount = 0;
    for (const apt of completedAppointments) {
      if (apt.start_time && apt.end_time) {
        const startMs = new Date(apt.start_time).getTime();
        const endMs = new Date(apt.end_time).getTime();
        const mins = (endMs - startMs) / 1000 / 60;
        if (mins > 0 && mins < 180) { // filter out absurd outliers
          totalMinutes += mins;
          validCount++;
        }
      }
    }
    if (validCount > 0) {
      avgConsultationTimeMins = Math.round(totalMinutes / validCount);
    }
  }

  return {
    activeCount: activeAppointments.length,
    todayCount: todayAppointments.length,
    patientsCount: patientsResult.count ?? 0,
    historyCount: recordsResult.count ?? 0,
    pendingClarifications: clarificationsResult?.count ?? 0,
    pendingTriageMandates: triageMandatesResult?.count ?? 0,
    qualityScore,
    qualityMessage: getQualityMessage(qualityScoreRaw),
    rankingPosition: rankingResult?.data?.rank_position ?? null,
    unreadCommunityCount: notificationsResult?.count ?? 0,
    satisfactionRate,
    avgRating,
    avgConsultationTimeMins,
    nextAppointment: nextAppt
      ? {
          time: new Date(nextAppt.start_time).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          patientName,
        }
      : null,
  };
}
