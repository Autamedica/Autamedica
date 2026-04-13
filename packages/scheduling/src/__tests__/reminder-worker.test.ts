import { it, expect, describe } from 'vitest';
import { processReminderCycle } from '../reminder-worker';
import { createMockSupabase } from './mock-supabase';
import { DEFAULT_OPENCLAW_CONFIG } from '../openclaw';

const workerConfig = {
  openclaw: { ...DEFAULT_OPENCLAW_CONFIG, token: 'test-token' },
  batchSize: 10,
  dryRun: true, // always dry run in tests
};

describe('processReminderCycle', () => {
  it('processes 0 reminders when none pending', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: [], error: null },
      appointment_waitlist: { data: [], error: null },
    });

    const result = await processReminderCycle(sb, workerConfig);

    expect(result.processed).toBe(0);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.waitlistOffersSent).toBe(0);
    expect(result.noShowsMarked).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('processes pending reminders in dry run mode', async () => {
    const mockReminder = {
      id: 'r-1',
      appointment_id: 'appt-1',
      channel: 'whatsapp',
      scheduled_for: '2026-03-18T08:00:00Z',
      sent_at: null,
      status: 'pending',
      response: null,
      retry_count: 0,
      next_retry_at: null,
      last_error: null,
      created_at: '2026-03-17T10:00:00Z',
    };

    const mockAppointment = {
      id: 'appt-1',
      start_time: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      end_time: new Date(Date.now() + 2.5 * 60 * 60 * 1000).toISOString(),
      type: 'consultation',
      status: 'scheduled',
      location: null,
      meeting_url: null,
      patients: {
        id: 'p-1',
        user_id: 'u-1',
        profiles: { first_name: 'Juan', last_name: 'Pérez', phone: '+5491155551234' },
      },
      doctors: {
        id: 'd-1',
        user_id: 'u-2',
        profiles: { first_name: 'María', last_name: 'García' },
      },
    };

    const sb = createMockSupabase({
      appointment_reminders: { data: [mockReminder], error: null },
      appointments: { data: mockAppointment, error: null },
      appointment_waitlist: { data: [], error: null },
    });

    const result = await processReminderCycle(sb, workerConfig);

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('handles failed reminder gracefully', async () => {
    const mockReminder = {
      id: 'r-fail',
      appointment_id: 'appt-missing',
      channel: 'whatsapp',
      scheduled_for: '2026-03-18T08:00:00Z',
      sent_at: null,
      status: 'pending',
      response: null,
      retry_count: 0,
      next_retry_at: null,
      last_error: null,
      created_at: '2026-03-17T10:00:00Z',
    };

    const sb = createMockSupabase({
      appointment_reminders: { data: [mockReminder], error: null },
      appointments: { data: null, error: { message: 'not found' } },
      appointment_waitlist: { data: [], error: null },
    });

    const result = await processReminderCycle(sb, workerConfig);

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('expires stale waitlist offers', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: [], error: null },
      appointment_waitlist: {
        data: [{ id: 'wl-expired-1' }],
        error: null,
      },
    });

    const result = await processReminderCycle(sb, workerConfig);

    expect(result.waitlistExpired).toBe(1);
  });

  it('returns errors array when cycle-level error occurs', async () => {
    const sb = createMockSupabase({
      appointment_reminders: { data: null, error: { message: 'DB connection lost' } },
      appointment_waitlist: { data: [], error: null },
    });

    const result = await processReminderCycle(sb, workerConfig);

    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('DB connection lost');
  });
});
