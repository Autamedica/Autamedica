import type { SupabaseClient } from '@supabase/supabase-js';
import type { PatientId, PrescriptionId } from '@autamedica/types';
import type {
  IAdherenceRepository,
  MedicationSchedule,
  MedicationScheduleDraft,
  IntakeEvent,
  AdherenceReport,
} from '../../domain/adherence.ports';

interface ScheduleRow {
  id: string;
  prescription_id: string;
  patient_id: string;
  drug_name: string;
  dosage: string;
  times_per_day: { hour: number; minute: number }[];
  days_pattern: MedicationSchedule['daysPattern'];
  custom_days: number[] | null;
  start_date: string;
  end_date: string | null;
  active: boolean;
  timezone: string;
  notes: string | null;
}

interface IntakeRow {
  id: string;
  schedule_id: string;
  patient_id: string;
  expected_at: string;
  confirmed_at: string | null;
  confirmation_channel: IntakeEvent['confirmationChannel'] | null;
  skipped: boolean;
  skipped_reason: string | null;
  reminder_sent_at: string | null;
  reminder_message_id: string | null;
}

function mapSchedule(row: ScheduleRow): MedicationSchedule {
  return {
    id: row.id,
    prescriptionId: row.prescription_id as PrescriptionId,
    patientId: row.patient_id as PatientId,
    drugName: row.drug_name,
    dosage: row.dosage,
    timesPerDay: row.times_per_day ?? [],
    daysPattern: row.days_pattern,
    customDays: row.custom_days ?? undefined,
    startDate: row.start_date,
    endDate: row.end_date ?? undefined,
    active: row.active,
    timezone: row.timezone,
    notes: row.notes ?? undefined,
  };
}

function mapIntake(row: IntakeRow): IntakeEvent {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    patientId: row.patient_id as PatientId,
    expectedAt: row.expected_at,
    confirmedAt: row.confirmed_at ?? undefined,
    confirmationChannel: row.confirmation_channel ?? undefined,
    skipped: row.skipped,
    skippedReason: row.skipped_reason ?? undefined,
    reminderSentAt: row.reminder_sent_at ?? undefined,
    reminderMessageId: row.reminder_message_id ?? undefined,
  };
}

export class SupabaseAdherenceRepository implements IAdherenceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async createSchedule(draft: MedicationScheduleDraft): Promise<MedicationSchedule> {
    const { data, error } = await this.supabase
      .from('medication_schedules')
      .insert({
        prescription_id: draft.prescriptionId,
        patient_id: draft.patientId,
        drug_name: draft.drugName,
        dosage: draft.dosage,
        times_per_day: draft.timesPerDay,
        days_pattern: draft.daysPattern ?? 'daily',
        custom_days: draft.customDays ?? null,
        start_date: draft.startDate,
        end_date: draft.endDate ?? null,
        timezone: draft.timezone ?? 'America/Argentina/Buenos_Aires',
        notes: draft.notes ?? null,
      })
      .select()
      .single();

    if (error || !data) throw new Error(`create schedule: ${error?.message ?? 'no data'}`);
    return mapSchedule(data as ScheduleRow);
  }

  async deactivateSchedule(scheduleId: string): Promise<void> {
    const { error } = await this.supabase
      .from('medication_schedules')
      .update({ active: false })
      .eq('id', scheduleId);
    if (error) throw new Error(`deactivate schedule: ${error.message}`);
  }

  async listActiveSchedules(patientId: PatientId): Promise<MedicationSchedule[]> {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await this.supabase
      .from('medication_schedules')
      .select('*')
      .eq('patient_id', patientId)
      .eq('active', true)
      .lte('start_date', today)
      .or(`end_date.is.null,end_date.gte.${today}`);
    if (error) throw new Error(`list schedules: ${error.message}`);
    return (data ?? []).map((r) => mapSchedule(r as ScheduleRow));
  }

  async ensureIntakeEvents(scheduleId: string, expectedAts: string[]): Promise<void> {
    if (expectedAts.length === 0) return;
    const { data: schedule } = await this.supabase
      .from('medication_schedules')
      .select('patient_id')
      .eq('id', scheduleId)
      .single();
    if (!schedule) throw new Error(`schedule not found: ${scheduleId}`);

    const rows = expectedAts.map((ts) => ({
      schedule_id: scheduleId,
      patient_id: schedule.patient_id,
      expected_at: ts,
    }));

    const { error } = await this.supabase
      .from('medication_intake_events')
      .upsert(rows, { onConflict: 'schedule_id,expected_at', ignoreDuplicates: true });
    if (error) throw new Error(`ensure intake events: ${error.message}`);
  }

  async listPendingReminders(horizonMinutes: number, batchSize: number): Promise<IntakeEvent[]> {
    const nowIso = new Date().toISOString();
    const horizonIso = new Date(Date.now() + horizonMinutes * 60_000).toISOString();
    const { data, error } = await this.supabase
      .from('medication_intake_events')
      .select('*')
      .is('confirmed_at', null)
      .eq('skipped', false)
      .is('reminder_sent_at', null)
      .gte('expected_at', nowIso)
      .lte('expected_at', horizonIso)
      .order('expected_at', { ascending: true })
      .limit(batchSize);
    if (error) throw new Error(`list pending reminders: ${error.message}`);
    return (data ?? []).map((r) => mapIntake(r as IntakeRow));
  }

  async markReminderSent(eventId: string, messageId: string): Promise<void> {
    const { error } = await this.supabase
      .from('medication_intake_events')
      .update({
        reminder_sent_at: new Date().toISOString(),
        reminder_message_id: messageId,
      })
      .eq('id', eventId);
    if (error) throw new Error(`mark reminder sent: ${error.message}`);
  }

  async confirmIntake(eventId: string, channel: IntakeEvent['confirmationChannel']): Promise<void> {
    const { error } = await this.supabase
      .from('medication_intake_events')
      .update({
        confirmed_at: new Date().toISOString(),
        confirmation_channel: channel ?? 'manual',
      })
      .eq('id', eventId);
    if (error) throw new Error(`confirm intake: ${error.message}`);
  }

  async skipIntake(eventId: string, reason: string): Promise<void> {
    const { error } = await this.supabase
      .from('medication_intake_events')
      .update({ skipped: true, skipped_reason: reason })
      .eq('id', eventId);
    if (error) throw new Error(`skip intake: ${error.message}`);
  }

  async adherenceWindow(scheduleId: string, fromIso: string, toIso: string): Promise<AdherenceReport> {
    const { data, error } = await this.supabase
      .from('medication_intake_events')
      .select('patient_id, confirmed_at, skipped, expected_at')
      .eq('schedule_id', scheduleId)
      .gte('expected_at', fromIso)
      .lte('expected_at', toIso);
    if (error) throw new Error(`adherence window: ${error.message}`);

    const rows = data ?? [];
    const expected = rows.length;
    const confirmed = rows.filter((r) => r.confirmed_at).length;
    const skipped = rows.filter((r) => r.skipped).length;
    const nowMs = Date.now();
    const missed = rows.filter(
      (r) => !r.confirmed_at && !r.skipped && new Date(r.expected_at).getTime() + 60 * 60_000 < nowMs,
    ).length;

    const patientId = (rows[0]?.patient_id ?? '') as PatientId;

    return {
      patientId,
      scheduleId,
      windowStart: fromIso,
      windowEnd: toIso,
      expectedCount: expected,
      confirmedCount: confirmed,
      skippedCount: skipped,
      missedCount: missed,
      adherenceRatio: expected > 0 ? confirmed / expected : 0,
    };
  }
}
