import { it, expect, describe } from 'vitest';
import {
  scheduleReminders,
  getPendingReminders,
  markReminderSent,
  markReminderFailed,
  markReminderForRetry,
  cancelReminders,
} from '../reminders';
import { createMockSupabase } from './mock-supabase';

const APPT_ID = 'aaaa-bbbb-cccc-dddd';

describe('scheduleReminders', () => {
  it('creates reminders for future appointment', async () => {
    const mockReminders = [
      { id: 'r-1', appointment_id: APPT_ID, channel: 'whatsapp', scheduled_for: '', status: 'pending', retry_count: 0, next_retry_at: null, last_error: null },
      { id: 'r-2', appointment_id: APPT_ID, channel: 'whatsapp', scheduled_for: '', status: 'pending', retry_count: 0, next_retry_at: null, last_error: null },
    ];

    const sb = createMockSupabase({
      appointment_reminders: { data: mockReminders, error: null },
    });

    const result = await scheduleReminders(sb, APPT_ID);
    expect(result.length).toBe(2);
  });

  it('throws when RPC scheduling fails', async () => {
    const sb = createMockSupabase(
      {
        appointment_reminders: { data: [], error: null },
      },
      {
        schedule_appointment_reminders: { data: null, error: { message: 'APPOINTMENT_NOT_FOUND' } },
      },
    );

    await expect(scheduleReminders(sb, APPT_ID)).rejects.toThrow('Error scheduling reminders');
  });

  it('returns empty array when RPC succeeds but nothing was inserted', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: [], error: null },
    });

    const result = await scheduleReminders(sb, APPT_ID);
    expect(result).toEqual([]);
  });
});

describe('getPendingReminders', () => {
  it('returns pending reminders', async () => {
    const mockReminders = [
      { id: 'r-1', status: 'pending', scheduled_for: '2026-03-18T10:00:00Z', retry_count: 0, next_retry_at: null, last_error: null },
      { id: 'r-2', status: 'pending', scheduled_for: '2026-03-18T10:01:00Z', retry_count: 1, next_retry_at: '2026-03-18T09:59:00Z', last_error: 'timeout' },
    ];

    const sb = createMockSupabase({
      appointment_reminders: { data: mockReminders, error: null },
    });

    const result = await getPendingReminders(sb);
    expect(result.length).toBe(2);
  });

  it('respects limit parameter', async () => {
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
  it('does not throw on success', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: null },
    });

    await expect(markReminderSent(sb, 'r-1')).resolves.toBeUndefined();
  });

  it('throws on error', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: { message: 'fail' } },
    });

    await expect(markReminderSent(sb, 'r-1')).rejects.toThrow('Error marking reminder sent');
  });
});

describe('markReminderFailed', () => {
  it('does not throw on success', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: null },
    });

    await expect(markReminderFailed(sb, 'r-1')).resolves.toBeUndefined();
  });
});

describe('markReminderForRetry', () => {
  it('keeps reminder pending while retries remain', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: null },
    });

    await expect(
      markReminderForRetry(sb, {
        id: 'r-1' as import('@autamedica/types').UUID,
        retry_count: 0,
      }, 'timeout'),
    ).resolves.toBe('retrying');
  });

  it('marks reminder failed when retries are exhausted', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: null },
    });

    await expect(
      markReminderForRetry(sb, {
        id: 'r-1' as import('@autamedica/types').UUID,
        retry_count: 2,
      }, 'timeout'),
    ).resolves.toBe('failed');
  });
});

describe('cancelReminders', () => {
  it('returns count of cancelled reminders', async () => {
    const sb = createMockSupabase({
      appointment_reminders: {
        data: [{ id: 'r-1' }, { id: 'r-2' }],
        error: null,
      },
    });

    const count = await cancelReminders(sb, APPT_ID);
    expect(count).toBe(2);
  });

  it('returns 0 when none to cancel', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: [], error: null },
    });

    const count = await cancelReminders(sb, APPT_ID);
    expect(count).toBe(0);
  });
});
