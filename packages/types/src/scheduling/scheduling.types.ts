/**
 * Scheduling Types - MediAgenda Engine
 *
 * Tipos para el motor de agenda inteligente:
 * disponibilidad, waitlist, recordatorios, historial, predicción de no-show.
 */

import type { UUID, ISODateString } from '../core/brand.types';

// ==========================================
// Doctor Availability
// ==========================================

/** Día de la semana: 0=domingo, 1=lunes, ..., 6=sábado */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miércoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sábado',
} as const;

/** Hora en formato HH:mm (string para compatibilidad con time de Postgres) */
export type TimeString = string;

export interface DoctorAvailability {
  id: UUID;
  doctor_id: UUID;
  day_of_week: DayOfWeek;
  start_time: TimeString;
  end_time: TimeString;
  slot_duration: number;
  is_active: boolean;
  location: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface DoctorAvailabilityInsert {
  doctor_id: UUID;
  day_of_week: DayOfWeek;
  start_time: TimeString;
  end_time: TimeString;
  slot_duration?: number;
  is_active?: boolean;
  location?: string | null;
}

export interface DoctorAvailabilityUpdate {
  start_time?: TimeString;
  end_time?: TimeString;
  slot_duration?: number;
  is_active?: boolean;
  location?: string | null;
}

// ==========================================
// Availability Overrides
// ==========================================

export interface AvailabilityOverride {
  id: UUID;
  doctor_id: UUID;
  override_date: string; // YYYY-MM-DD
  is_available: boolean;
  start_time: TimeString | null;
  end_time: TimeString | null;
  reason: string | null;
  created_at: ISODateString;
}

export interface AvailabilityOverrideInsert {
  doctor_id: UUID;
  override_date: string;
  is_available: boolean;
  start_time?: TimeString | null;
  end_time?: TimeString | null;
  reason?: string | null;
}

// ==========================================
// Available Slot (computed, not stored)
// ==========================================

export interface ScheduleSlot {
  doctor_id: UUID;
  date: string;          // YYYY-MM-DD
  start_time: string;    // ISO datetime
  end_time: string;      // ISO datetime
  duration_minutes: number;
  location: string | null;
  is_available: boolean;
  /** Slot permite overbooking por alta probabilidad de no-show en cita existente */
  overbook_eligible: boolean;
}

export interface SlotQuery {
  doctor_id: UUID;
  date_from: string;     // YYYY-MM-DD
  date_to: string;       // YYYY-MM-DD
  appointment_type?: string;
  /** IANA timezone for slot generation (default: America/Argentina/Buenos_Aires) */
  timezone?: string;
}

// ==========================================
// Appointment Waitlist
// ==========================================

export type WaitlistStatus = 'waiting' | 'offered' | 'booked' | 'expired' | 'cancelled';
export type WaitlistPriority = 0 | 1 | 2; // 0=normal, 1=preferente, 2=urgente

export const WAITLIST_STATUSES: readonly WaitlistStatus[] = [
  'waiting', 'offered', 'booked', 'expired', 'cancelled',
] as const;

export const WAITLIST_PRIORITY_LABELS: Record<WaitlistPriority, string> = {
  0: 'Normal',
  1: 'Preferente',
  2: 'Urgente',
} as const;

export interface WaitlistEntry {
  id: UUID;
  patient_id: UUID;
  doctor_id: UUID;
  preferred_date_start: string | null;
  preferred_date_end: string | null;
  preferred_time_start: TimeString | null;
  preferred_time_end: TimeString | null;
  appointment_type: string;
  priority: WaitlistPriority;
  status: WaitlistStatus;
  offered_at: ISODateString | null;
  offer_sent_at: ISODateString | null;
  offered_start_time: ISODateString | null;
  offered_end_time: ISODateString | null;
  expires_at: ISODateString | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface WaitlistEntryInsert {
  patient_id: UUID;
  doctor_id: UUID;
  preferred_date_start?: string | null;
  preferred_date_end?: string | null;
  preferred_time_start?: TimeString | null;
  preferred_time_end?: TimeString | null;
  appointment_type?: string;
  priority?: WaitlistPriority;
}

// ==========================================
// Appointment Reminders
// ==========================================

export type ReminderChannel = 'whatsapp' | 'email' | 'sms' | 'push';
export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'cancelled';
export type ReminderResponse = 'confirmed' | 'cancelled' | 'rescheduled';

export const REMINDER_CHANNELS: readonly ReminderChannel[] = [
  'whatsapp', 'email', 'sms', 'push',
] as const;

export interface AppointmentReminder {
  id: UUID;
  appointment_id: UUID;
  channel: ReminderChannel;
  scheduled_for: ISODateString;
  sent_at: ISODateString | null;
  status: ReminderStatus;
  response: ReminderResponse | null;
  retry_count: number;
  next_retry_at: ISODateString | null;
  last_error: string | null;
  created_at: ISODateString;
}

export interface AppointmentReminderInsert {
  appointment_id: UUID;
  channel: ReminderChannel;
  scheduled_for: ISODateString;
}

// ==========================================
// Appointment History
// ==========================================

export type AppointmentAction =
  | 'created'
  | 'confirmed'
  | 'cancelled'
  | 'no_show'
  | 'completed'
  | 'rescheduled'
  | 'updated';

export const APPOINTMENT_ACTIONS: readonly AppointmentAction[] = [
  'created', 'confirmed', 'cancelled', 'no_show', 'completed', 'rescheduled', 'updated',
] as const;

export interface AppointmentHistoryEntry {
  id: UUID;
  appointment_id: UUID;
  patient_id: UUID;
  doctor_id: UUID;
  action: AppointmentAction;
  old_status: string | null;
  new_status: string | null;
  metadata: Record<string, unknown>;
  created_at: ISODateString;
}

// ==========================================
// No-Show Prediction
// ==========================================

export interface NoShowPrediction {
  patient_id: UUID;
  doctor_id: UUID;
  probability: number; // 0.0 - 1.0
  risk_level: 'low' | 'medium' | 'high';
  factors: NoShowFactor[];
}

export interface NoShowFactor {
  name: string;
  weight: number;
  value: number;
  description: string;
}

// ==========================================
// Scheduling Config
// ==========================================

export interface SchedulingConfig {
  /** Minutos antes de la cita para enviar primer recordatorio */
  reminder_hours_before: number[];
  /** Horas para que una oferta de waitlist expire */
  waitlist_offer_expiry_hours: number;
  /** Umbral de probabilidad de no-show para habilitar overbooking */
  noshow_overbooking_threshold: number;
  /** Minutos de gracia luego del fin de la cita antes de marcar no_show */
  noshow_grace_minutes: number;
  /** Días máximos de anticipación para agendar */
  max_advance_booking_days: number;
  /** Minutos mínimos de anticipación para agendar */
  min_advance_booking_minutes: number;
}

export interface DoctorSchedulingConfig extends SchedulingConfig {
  doctor_id: UUID;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  reminder_hours_before: [24, 2],
  waitlist_offer_expiry_hours: 4,
  noshow_overbooking_threshold: 0.3,
  noshow_grace_minutes: 30,
  max_advance_booking_days: 60,
  min_advance_booking_minutes: 60,
};

// ==========================================
// Type Guards
// ==========================================

export const isDayOfWeek = (v: unknown): v is DayOfWeek =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6;

export const isWaitlistStatus = (v: unknown): v is WaitlistStatus =>
  typeof v === 'string' && WAITLIST_STATUSES.includes(v as WaitlistStatus);

export const isReminderChannel = (v: unknown): v is ReminderChannel =>
  typeof v === 'string' && REMINDER_CHANNELS.includes(v as ReminderChannel);

export const isAppointmentAction = (v: unknown): v is AppointmentAction =>
  typeof v === 'string' && APPOINTMENT_ACTIONS.includes(v as AppointmentAction);

export const isHighNoShowRisk = (prediction: NoShowPrediction): boolean =>
  prediction.probability >= 0.4;
