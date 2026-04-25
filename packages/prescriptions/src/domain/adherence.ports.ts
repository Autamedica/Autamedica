import type { PatientId, PrescriptionId } from '@autamedica/types';

export type DaysPattern = 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface TimeOfDay {
  hour: number;
  minute: number;
}

export interface MedicationSchedule {
  id: string;
  prescriptionId: PrescriptionId;
  patientId: PatientId;
  drugName: string;
  dosage: string;
  timesPerDay: TimeOfDay[];
  daysPattern: DaysPattern;
  customDays?: number[];
  startDate: string;
  endDate?: string;
  active: boolean;
  timezone: string;
  notes?: string;
}

export interface MedicationScheduleDraft {
  prescriptionId: PrescriptionId;
  patientId: PatientId;
  drugName: string;
  dosage: string;
  timesPerDay: TimeOfDay[];
  daysPattern?: DaysPattern;
  customDays?: number[];
  startDate: string;
  endDate?: string;
  timezone?: string;
  notes?: string;
}

export interface IntakeEvent {
  id: string;
  scheduleId: string;
  patientId: PatientId;
  expectedAt: string;
  confirmedAt?: string;
  confirmationChannel?: 'whatsapp' | 'app' | 'auto' | 'manual';
  skipped: boolean;
  skippedReason?: string;
  reminderSentAt?: string;
  reminderMessageId?: string;
}

export interface AdherenceReport {
  patientId: PatientId;
  scheduleId: string;
  windowStart: string;
  windowEnd: string;
  expectedCount: number;
  confirmedCount: number;
  skippedCount: number;
  missedCount: number;
  adherenceRatio: number;
}

export interface IAdherenceRepository {
  createSchedule(draft: MedicationScheduleDraft): Promise<MedicationSchedule>;
  deactivateSchedule(scheduleId: string): Promise<void>;
  listActiveSchedules(patientId: PatientId): Promise<MedicationSchedule[]>;
  ensureIntakeEvents(scheduleId: string, expectedAts: string[]): Promise<void>;
  listPendingReminders(horizonMinutes: number, batchSize: number): Promise<IntakeEvent[]>;
  markReminderSent(eventId: string, messageId: string): Promise<void>;
  confirmIntake(eventId: string, channel: IntakeEvent['confirmationChannel']): Promise<void>;
  skipIntake(eventId: string, reason: string): Promise<void>;
  adherenceWindow(scheduleId: string, fromIso: string, toIso: string): Promise<AdherenceReport>;
}
