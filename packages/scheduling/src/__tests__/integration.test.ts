/**
 * Integration tests — Ejecuta queries reales contra Supabase.
 *
 * Requiere:
 * - SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env
 * - Las tablas de MediAgenda creadas (migración aplicada)
 *
 * Crea datos de prueba, ejecuta los flujos, y limpia al final.
 */

import { it, expect, describe, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  getAvailableSlots,
  checkConflict,
  addToWaitlist,
  expireStaleOffers,
  cancelWaitlistEntry,
  getDoctorWaitlist,
  scheduleReminders,
  markReminderSent,
  markReminderFailed,
  cancelReminders,
  predictNoShowProbability,
  processReminderCycle,
  DEFAULT_OPENCLAW_CONFIG,
} from '../index';

// ==========================================
// Setup
// ==========================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    'Integration tests require SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.\n' +
    'Run from apps/reminder-worker/ or set env vars manually.',
  );
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// Test data IDs — will be populated during setup
let testDoctorId: string;
let testPatientId: string;
let _testDoctorUserId: string;
let _testPatientUserId: string;
let _testAppointmentId: string;

// IDs to clean up
const cleanupAvailabilityIds: string[] = [];
const cleanupOverrideIds: string[] = [];
const cleanupWaitlistIds: string[] = [];
const cleanupReminderIds: string[] = [];
const cleanupAppointmentIds: string[] = [];
const cleanupHistoryIds: string[] = [];

// ==========================================
// Helpers
// ==========================================

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function futureDatetime(daysFromNow: number, hour: number, minute: number = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// Find next occurrence of a given day_of_week from today
function nextDayOfWeek(dow: number): string {
  const d = new Date();
  const currentDow = d.getDay();
  const daysAhead = (dow - currentDow + 7) % 7 || 7; // at least 1 day ahead
  d.setDate(d.getDate() + daysAhead);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ==========================================
// Setup: find or create test doctor + patient
// ==========================================

beforeAll(async () => {
  // Find an existing doctor
  const { data: doctors } = await supabase
    .from('doctors')
    .select('id, user_id')
    .limit(1)
    .single();

  if (!doctors) {
    throw new Error('No doctors found in DB. Create at least one doctor before running integration tests.');
  }

  testDoctorId = doctors.id;
  _testDoctorUserId = doctors.user_id;

  // Find an existing patient
  const { data: patients } = await supabase
    .from('patients')
    .select('id, user_id')
    .limit(1)
    .single();

  if (!patients) {
    throw new Error('No patients found in DB. Create at least one patient before running integration tests.');
  }

  testPatientId = patients.id;
  _testPatientUserId = patients.user_id;

  console.log(`[Integration] Doctor: ${testDoctorId}, Patient: ${testPatientId}`);
});

// ==========================================
// Cleanup
// ==========================================

afterAll(async () => {
  // Clean up in reverse dependency order
  if (cleanupReminderIds.length > 0) {
    await supabase
      .from('appointment_reminders')
      .delete()
      .in('id', cleanupReminderIds);
  }

  if (cleanupHistoryIds.length > 0) {
    await supabase
      .from('appointment_history')
      .delete()
      .in('id', cleanupHistoryIds);
  }

  if (cleanupAppointmentIds.length > 0) {
    // Delete history first (cascade should handle, but be safe)
    await supabase
      .from('appointment_history')
      .delete()
      .in('appointment_id', cleanupAppointmentIds);
    await supabase
      .from('appointment_reminders')
      .delete()
      .in('appointment_id', cleanupAppointmentIds);
    await supabase
      .from('appointments')
      .delete()
      .in('id', cleanupAppointmentIds);
  }

  if (cleanupWaitlistIds.length > 0) {
    await supabase
      .from('appointment_waitlist')
      .delete()
      .in('id', cleanupWaitlistIds);
  }

  if (cleanupOverrideIds.length > 0) {
    await supabase
      .from('doctor_availability_overrides')
      .delete()
      .in('id', cleanupOverrideIds);
  }

  if (cleanupAvailabilityIds.length > 0) {
    await supabase
      .from('doctor_availability')
      .delete()
      .in('id', cleanupAvailabilityIds);
  }

  console.log('[Integration] Cleanup complete.');
});

// ==========================================
// Tests: Doctor Availability + Slots
// ==========================================

describe('Integration: Availability & Slots', () => {
  it('create availability and generate slots', async () => {
    // Use Wednesday (3) to avoid conflicts with existing data
    const targetDow = 3;
    const targetDate = nextDayOfWeek(targetDow);

    // Create availability for Wednesday 09:00-11:00
    const { data: avail, error: availErr } = await supabase
      .from('doctor_availability')
      .insert({
        doctor_id: testDoctorId,
        day_of_week: targetDow,
        start_time: '09:00',
        end_time: '11:00',
        slot_duration: 30,
        is_active: true,
        location: 'Test Consultorio',
      })
      .select('*')
      .single();

    if (availErr) {
      // May already exist from previous run — try to find it
      const { data: existing } = await supabase
        .from('doctor_availability')
        .select('*')
        .eq('doctor_id', testDoctorId)
        .eq('day_of_week', targetDow)
        .eq('start_time', '09:00')
        .single();

      if (existing) {
        cleanupAvailabilityIds.push(existing.id);
      } else {
        throw new Error(`Failed to create availability: ${availErr.message}`);
      }
    } else {
      cleanupAvailabilityIds.push(avail.id);
    }

    // Generate slots for that date
    const slots = await getAvailableSlots(supabase, {
      doctor_id: testDoctorId as import('@autamedica/types').UUID,
      date_from: targetDate,
      date_to: targetDate,
    });

    // 09:00-11:00 with 30min = 4 slots
    const testSlots = slots.filter(s => s.location === 'Test Consultorio');
    expect(testSlots.length).toBe(4);
    expect(testSlots.every(s => s.doctor_id === testDoctorId)).toBe(true);
    expect(testSlots.every(s => s.duration_minutes === 30)).toBe(true);
  });

  it('override blocks availability for a day', async () => {
    const targetDow = 3;
    const targetDate = nextDayOfWeek(targetDow);

    // Create an override marking the doctor unavailable
    const { data: override, error: overErr } = await supabase
      .from('doctor_availability_overrides')
      .insert({
        doctor_id: testDoctorId,
        override_date: targetDate,
        is_available: false,
        reason: 'Integration test — vacaciones',
      })
      .select('*')
      .single();

    expect(overErr).toBeNull();
    expect(override).not.toBeNull();
    if (override) cleanupOverrideIds.push(override.id);

    // Slots should be empty for this date
    const slots = await getAvailableSlots(supabase, {
      doctor_id: testDoctorId as import('@autamedica/types').UUID,
      date_from: targetDate,
      date_to: targetDate,
    });

    expect(slots.length).toBe(0);

    // Clean up override so it doesn't affect later tests
    await supabase
      .from('doctor_availability_overrides')
      .delete()
      .eq('id', override?.id ?? '');
    cleanupOverrideIds.pop();
  });
});

// ==========================================
// Tests: Conflict Detection
// ==========================================

describe('Integration: Conflict Detection', () => {
  it('checkConflict returns false when no appointments', async () => {
    const tomorrow = futureDate(1);
    const hasConflict = await checkConflict(
      supabase,
      testDoctorId,
      `${tomorrow}T23:00:00Z`,
      `${tomorrow}T23:30:00Z`,
    );
    // Using 23:00 to minimize chance of real conflict
    expect(hasConflict).toBe(false);
  });

  it('checkConflict detects real appointment overlap', async () => {
    // Create a real appointment
    const startTime = futureDatetime(5, 22, 0); // 5 days from now, 10pm
    const endTime = futureDatetime(5, 22, 30);

    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        patient_id: testPatientId,
        doctor_id: testDoctorId,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        type: 'consultation',
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    if (appt) cleanupAppointmentIds.push(appt.id);

    // Should detect conflict at same time
    const hasConflict = await checkConflict(supabase, testDoctorId, startTime, endTime);
    expect(hasConflict).toBe(true);

    // Should NOT detect conflict at different time
    const noConflict = await checkConflict(
      supabase,
      testDoctorId,
      futureDatetime(5, 23, 0),
      futureDatetime(5, 23, 30),
    );
    expect(noConflict).toBe(false);
  });
});

// ==========================================
// Tests: Waitlist
// ==========================================

describe('Integration: Waitlist', () => {
  it('add to waitlist, get doctor waitlist, cancel', async () => {
    const entry = await addToWaitlist(supabase, {
      patient_id: testPatientId as import('@autamedica/types').UUID,
      doctor_id: testDoctorId as import('@autamedica/types').UUID,
      appointment_type: 'integration-test',
      priority: 0 as import('@autamedica/types').WaitlistPriority,
    });

    expect(entry.id).toBeDefined();
    expect(entry.status).toBe('waiting');
    expect(entry.patient_id).toBe(testPatientId);
    cleanupWaitlistIds.push(entry.id);

    // Should appear in doctor's waitlist
    const waitlist = await getDoctorWaitlist(supabase, testDoctorId);
    const found = waitlist.find(w => w.id === entry.id);
    expect(found).toBeDefined();

    // Cancel it
    await cancelWaitlistEntry(supabase, entry.id, testPatientId);

    // Should no longer appear
    const afterCancel = await getDoctorWaitlist(supabase, testDoctorId);
    const gone = afterCancel.find(w => w.id === entry.id);
    expect(gone).toBeUndefined();
  });

  it('expire stale offers (no errors)', async () => {
    // Should not throw even with no stale offers
    const count = await expireStaleOffers(supabase);
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// ==========================================
// Tests: Reminders
// ==========================================

describe('Integration: Reminders', () => {
  it('schedule and cancel reminders for appointment', async () => {
    // Create a future appointment (3 days out)
    const startTime = futureDatetime(3, 10, 0);
    const endTime = futureDatetime(3, 10, 30);

    const { data: appt, error: apptErr } = await supabase
      .from('appointments')
      .insert({
        patient_id: testPatientId,
        doctor_id: testDoctorId,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        type: 'consultation',
      })
      .select('id')
      .single();

    expect(apptErr).toBeNull();
    if (appt) cleanupAppointmentIds.push(appt.id);

    // Schedule reminders
    const reminders = await scheduleReminders(supabase, appt?.id ?? '', 'whatsapp');

    expect(reminders.length).toBe(2); // 24h + 2h before
    for (const r of reminders) {
      cleanupReminderIds.push(r.id);
      expect(r.status).toBe('pending');
      expect(r.channel).toBe('whatsapp');
      expect(r.appointment_id).toBe(appt?.id);
    }

    // Cancel all reminders
    const cancelled = await cancelReminders(supabase, appt?.id ?? '');
    expect(cancelled).toBe(2);

    // Verify they're cancelled
    const { data: afterCancel } = await supabase
      .from('appointment_reminders')
      .select('status')
      .in('id', reminders.map(r => r.id));

    expect(afterCancel?.every(r => r.status === 'cancelled')).toBe(true);
  });

  it('markReminderSent and markReminderFailed work', async () => {
    // Create appointment + reminders
    const startTime = futureDatetime(4, 14, 0);
    const endTime = futureDatetime(4, 14, 30);

    const { data: appt } = await supabase
      .from('appointments')
      .insert({
        patient_id: testPatientId,
        doctor_id: testDoctorId,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        type: 'consultation',
      })
      .select('id')
      .single();

    if (appt) cleanupAppointmentIds.push(appt.id);

    const reminders = await scheduleReminders(supabase, appt?.id ?? '', 'whatsapp');
    for (const r of reminders) cleanupReminderIds.push(r.id);

    // Mark first as sent
    await markReminderSent(supabase, reminders[0].id, 'confirmed');

    const { data: sentReminder } = await supabase
      .from('appointment_reminders')
      .select('status, response, sent_at')
      .eq('id', reminders[0].id)
      .single();

    expect(sentReminder?.status).toBe('sent');
    expect(sentReminder?.response).toBe('confirmed');
    expect(sentReminder?.sent_at).not.toBeNull();

    // Mark second as failed
    if (reminders.length > 1) {
      await markReminderFailed(supabase, reminders[1].id);

      const { data: failedReminder } = await supabase
        .from('appointment_reminders')
        .select('status')
        .eq('id', reminders[1].id)
        .single();

      expect(failedReminder?.status).toBe('failed');
    }
  });
});

// ==========================================
// Tests: No-Show Prediction
// ==========================================

describe('Integration: No-Show Prediction', () => {
  it('returns prediction with factors', async () => {
    const prediction = await predictNoShowProbability(
      supabase,
      testPatientId,
      testDoctorId,
      1, // monday
      10, // 10am
    );

    expect(prediction.patient_id).toBe(testPatientId);
    expect(prediction.doctor_id).toBe(testDoctorId);
    expect(prediction.probability).toBeGreaterThanOrEqual(0);
    expect(prediction.probability).toBeLessThanOrEqual(1);
    expect(['low', 'medium', 'high']).toContain(prediction.risk_level);
    expect(prediction.factors.length).toBe(3);

    // Weights should sum to 1
    const totalWeight = prediction.factors.reduce((s, f) => s + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });
});

// ==========================================
// Tests: Reminder Worker Cycle
// ==========================================

describe('Integration: Worker Cycle', () => {
  it('processReminderCycle runs without errors in dry run', async () => {
    const result = await processReminderCycle(supabase, {
      openclaw: { ...DEFAULT_OPENCLAW_CONFIG, token: '' },
      batchSize: 5,
      dryRun: true,
    });

    expect(result.errors.length).toBe(0);
    expect(result.processed).toBeGreaterThanOrEqual(0);
    expect(result.waitlistExpired).toBeGreaterThanOrEqual(0);
  });
});

// ==========================================
// Tests: DB Triggers (appointment_history)
// ==========================================

describe('Integration: DB Triggers', () => {
  it('creating appointment auto-logs to appointment_history', async () => {
    const startTime = futureDatetime(6, 15, 0);
    const endTime = futureDatetime(6, 15, 30);

    const { data: appt, error } = await supabase
      .from('appointments')
      .insert({
        patient_id: testPatientId,
        doctor_id: testDoctorId,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        type: 'consultation',
      })
      .select('id')
      .single();

    expect(error).toBeNull();
    if (appt) cleanupAppointmentIds.push(appt.id);

    // Check that a history entry was auto-created by the trigger
    const { data: history } = await supabase
      .from('appointment_history')
      .select('*')
      .eq('appointment_id', appt?.id ?? '')
      .eq('action', 'created');

    expect(history).not.toBeNull();
    expect((history ?? []).length).toBeGreaterThanOrEqual(1);

    const entry = (history ?? [])[0];
    expect(entry.patient_id).toBe(testPatientId);
    expect(entry.doctor_id).toBe(testDoctorId);
    expect(entry.new_status).toBe('scheduled');
    if (entry) cleanupHistoryIds.push(entry.id);
  });

  it('updating appointment status logs to history', async () => {
    const startTime = futureDatetime(7, 16, 0);
    const endTime = futureDatetime(7, 16, 30);

    const { data: appt } = await supabase
      .from('appointments')
      .insert({
        patient_id: testPatientId,
        doctor_id: testDoctorId,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        type: 'consultation',
      })
      .select('id')
      .single();

    if (appt) cleanupAppointmentIds.push(appt.id);

    // Update status to confirmed
    await supabase
      .from('appointments')
      .update({ status: 'confirmed' })
      .eq('id', appt?.id ?? '');

    // Check history has both 'created' and 'confirmed' entries
    const { data: history } = await supabase
      .from('appointment_history')
      .select('*')
      .eq('appointment_id', appt?.id ?? '')
      .order('created_at', { ascending: true });

    expect((history ?? []).length).toBeGreaterThanOrEqual(2);

    const createEntry = (history ?? []).find(h => h.action === 'created');
    const confirmEntry = (history ?? []).find(h => h.action === 'confirmed');

    expect(createEntry).toBeDefined();
    expect(confirmEntry).toBeDefined();
    expect(confirmEntry?.old_status).toBe('scheduled');
    expect(confirmEntry?.new_status).toBe('confirmed');

    for (const h of history ?? []) cleanupHistoryIds.push(h.id);
  });

  it('conflict trigger prevents overlapping appointments', async () => {
    const startTime = futureDatetime(8, 20, 0);
    const endTime = futureDatetime(8, 20, 30);

    // First appointment should succeed
    const { data: appt1, error: err1 } = await supabase
      .from('appointments')
      .insert({
        patient_id: testPatientId,
        doctor_id: testDoctorId,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        type: 'consultation',
      })
      .select('id')
      .single();

    expect(err1).toBeNull();
    if (appt1) cleanupAppointmentIds.push(appt1.id);

    // Second overlapping appointment should fail
    const { error: err2 } = await supabase
      .from('appointments')
      .insert({
        patient_id: testPatientId,
        doctor_id: testDoctorId,
        start_time: startTime,
        end_time: endTime,
        status: 'scheduled',
        type: 'consultation',
      })
      .select('id')
      .single();

    expect(err2).not.toBeNull();
    expect(err2?.message).toContain('SCHEDULING_CONFLICT');
  });
});
