import { test, expect, describe } from 'bun:test';
import {
  scheduleReminders,
  getPendingReminders,
  markReminderSent,
  markReminderFailed,
  cancelReminders,
} from '../reminders';
import { createMockSupabase } from './mock-supabase';

const APPT_ID = 'aaaa-bbbb-cccc-dddd';

describe('scheduleReminders', () => {
  test('creates reminders for future appointment', async () => {
    // Appointment 48 hours in the future
    const futureStart = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const mockReminders = [
      { id: 'r-1', appointment_id: APPT_ID, channel: 'whatsapp', scheduled_for: '', status: 'pending' },
      { id: 'r-2', appointment_id: APPT_ID, channel: 'whatsapp', scheduled_for: '', status: 'pending' },
    ];

    const sb = createMockSupabase({
      appointments: {
        data: { start_time: futureStart, status: 'scheduled' },
        error: null,
      },
      appointment_reminders: { data: mockReminders, error: null },
    });

    const result = await scheduleReminders(sb, APPT_ID);
    expect(result.length).toBe(2);
  });

  test('throws for cancelled appointment', async () => {
    const sb = createMockSupabase({
      appointments: {
        data: { start_time: new Date().toISOString(), status: 'cancelled' },
        error: null,
      },
    });

    await expect(scheduleReminders(sb, APPT_ID)).rejects.toThrow(
      'Cannot schedule reminders for cancelled/no-show appointments',
    );
  });

  test('throws when appointment not found', async () => {
    const sb = createMockSupabase({
      appointments: { data: null, error: { message: 'not found' } },
    });

    await expect(scheduleReminders(sb, APPT_ID)).rejects.toThrow('Appointment not found');
  });

  test('returns empty array when appointment is too soon', async () => {
    // Appointment 30 minutes from now - both 24h and 2h reminders are in the past
    const soonStart = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const sb = createMockSupabase({
      appointments: {
        data: { start_time: soonStart, status: 'scheduled' },
        error: null,
      },
      appointment_reminders: { data: [], error: null },
    });

    const result = await scheduleReminders(sb, APPT_ID);
    expect(result).toEqual([]);
  });
});

describe('getPendingReminders', () => {
  test('returns pending reminders', async () => {
    const mockReminders = [
      { id: 'r-1', status: 'pending', scheduled_for: '2026-03-18T10:00:00Z' },
      { id: 'r-2', status: 'pending', scheduled_for: '2026-03-18T10:01:00Z' },
    ];

    const sb = createMockSupabase({
      appointment_reminders: { data: mockReminders, error: null },
    });

    const result = await getPendingReminders(sb);
    expect(result.length).toBe(2);
  });

  test('respects limit parameter', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: [{ id: 'r-1' }], error: null },
    });

    const result = await getPendingReminders(sb, 1);
    expect(result.length).toBe(1);
    // Verify limit was passed
    const limitCall = sb.calls.find(c => c.method === 'limit');
    expect(limitCall?.args[0]).toBe(1);
  });
});

describe('markReminderSent', () => {
  test('does not throw on success', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: null },
    });

    await expect(markReminderSent(sb, 'r-1')).resolves.toBeUndefined();
  });

  test('throws on error', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: { message: 'fail' } },
    });

    await expect(markReminderSent(sb, 'r-1')).rejects.toThrow('Error marking reminder sent');
  });
});

describe('markReminderFailed', () => {
  test('does not throw on success', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: null },
    });

    await expect(markReminderFailed(sb, 'r-1')).resolves.toBeUndefined();
  });
});

describe('cancelReminders', () => {
  test('returns count of cancelled reminders', async () => {
    const sb = createMockSupabase({
      appointment_reminders: {
        data: [{ id: 'r-1' }, { id: 'r-2' }],
        error: null,
      },
    });

    const count = await cancelReminders(sb, APPT_ID);
    expect(count).toBe(2);
  });

  test('returns 0 when none to cancel', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: [], error: null },
    });

    const count = await cancelReminders(sb, APPT_ID);
    expect(count).toBe(0);
  });
});
