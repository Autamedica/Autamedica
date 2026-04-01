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

  const { data: patient } = await supabase
    .from('patients')
    .select('user_id')
    .eq('id', patientId)
    .single();

  if (!patient?.user_id) return 'Paciente';

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, last_name')
    .eq('user_id', patient.user_id)
    .single();

  const prof = profile as ProfileRow | null;
  if (!prof) return 'Paciente';

  return `${prof.first_name ?? ''} ${prof.last_name ?? ''}`.trim() || 'Paciente';
}

/**
 * Get doctor stats: active appointments, today's appointments, unique patients, medical records count.
 * Returns next upcoming appointment with patient name resolved.
 */
export async function getDoctorStats(doctorId: string): Promise<DoctorStats> {
  const supabase = getBrowserSupabaseClient();

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
  const nowIso = now.toISOString();

  const [apptResult, patientsResult, recordsResult] = await Promise.all([
    supabase
      .from('appointments')
      .select('id, start_time, status, patient_id')
      .eq('doctor_id', doctorId)
      .gte('start_time', startOfDay)
      .order('start_time', { ascending: true }),
    supabase
      .from('patient_care_team')
      .select('patient_id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId)
      .eq('active', true),
    supabase
      .from('medical_records')
      .select('id', { count: 'exact', head: true })
      .eq('doctor_id', doctorId),
  ]);

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
