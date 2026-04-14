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
  rankingPosition?: number | null;
  unreadCommunityCount?: number;
  nextAppointment: {
    time: string;
    patientName: string;
  } | null;
}

interface AppointmentRow {
  id: string;
  start_time: string;
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
      .select('id, start_time, status, patient_id')
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
      .select('rank_position')
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
    // Pending clinical triage mandates: non-routine cases awaiting resolution
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

  return {
    activeCount: activeAppointments.length,
    todayCount: todayAppointments.length,
    patientsCount: patientsResult.count ?? 0,
    historyCount: recordsResult.count ?? 0,
    pendingClarifications: clarificationsResult?.count ?? 0,
    pendingTriageMandates: triageMandatesResult?.count ?? 0,
    rankingPosition: rankingResult?.data?.rank_position ?? null,
    unreadCommunityCount: notificationsResult?.count ?? 0,
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
