/**
 * Tipos para el sistema de citas médicas
 *
 * Alineado con CHECK constraints de la tabla appointments en BD:
 * - status: payment_pending, scheduled, confirmed, in_progress, completed, cancelled, no_show
 * - type: consultation, follow_up, emergency, telemedicine, lab_test
 * - Campo primario de tiempo: start_time (no scheduled_at)
 */

export type AppointmentStatus = 'payment_pending' | 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export type AppointmentType = 'consultation' | 'follow_up' | 'emergency' | 'telemedicine' | 'lab_test';

export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string | null;
  start_time?: string;
  end_time?: string | null;
  duration_minutes: number;
  status: AppointmentStatus;
  type: AppointmentType;
  notes: string | null;
  reason: string | null;
  meeting_url?: string | null;
  location?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAppointmentInput {
  doctor_id?: string | null;
  start_time: string;
  duration_minutes?: number;
  type?: AppointmentType;
  notes?: string;
  reason?: string;
  meeting_url?: string;
  location?: string;
}

export interface UpdateAppointmentInput {
  start_time?: string;
  duration_minutes?: number;
  status?: AppointmentStatus;
  type?: AppointmentType;
  notes?: string;
  reason?: string;
  meeting_url?: string | null;
  location?: string | null;
}

export interface AppointmentWithDoctor extends Appointment {
  doctor?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    specialty: string | null;
    consultation_fee?: number | null;
    profile_picture_url: string | null;
  } | null;
}
