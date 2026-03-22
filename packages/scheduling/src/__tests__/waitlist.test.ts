import { test, expect, describe } from 'bun:test';
import {
  addToWaitlist,
  processWaitlist,
  expireStaleOffers,
  cancelWaitlistEntry,
  getDoctorWaitlist,
} from '../waitlist';
import { createMockSupabase } from './mock-supabase';

const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';
const PATIENT_ID = '22222222-2222-2222-2222-222222222222';

const mockWaitlistEntry = {
  id: 'wl-1',
  patient_id: PATIENT_ID,
  doctor_id: DOCTOR_ID,
  preferred_date_start: '2026-03-23',
  preferred_date_end: '2026-03-27',
  preferred_time_start: '09:00',
  preferred_time_end: '12:00',
  appointment_type: 'consultation',
  priority: 0,
  status: 'waiting',
  offered_at: null,
  expires_at: null,
  created_at: '2026-03-18T10:00:00Z',
  updated_at: '2026-03-18T10:00:00Z',
};

describe('addToWaitlist', () => {
  test('inserts entry and returns it', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: { data: mockWaitlistEntry, error: null },
    });

    const result = await addToWaitlist(sb, {
      patient_id: PATIENT_ID as import('@autamedica/types').UUID,
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      appointment_type: 'consultation',
    });

    expect(result.id).toBe('wl-1');
    expect(result.status).toBe('waiting');
  });

  test('throws on error', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: { data: null, error: { message: 'constraint' } },
    });

    await expect(
      addToWaitlist(sb, {
        patient_id: PATIENT_ID as import('@autamedica/types').UUID,
        doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      }),
    ).rejects.toThrow('Error adding to waitlist');
  });
});

describe('processWaitlist', () => {
  test('returns matching candidate when preferences match', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: {
        data: [mockWaitlistEntry],
        error: null,
      },
    });

    const result = await processWaitlist(sb, DOCTOR_ID, {
      date: '2026-03-24',
      start_time: '2026-03-24T10:00:00Z',
      end_time: '2026-03-24T10:30:00Z',
    });

    expect(result).not.toBeNull();
  });

  test('returns null when no candidates', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: { data: [], error: null },
    });

    const result = await processWaitlist(sb, DOCTOR_ID, {
      date: '2026-03-24',
      start_time: '2026-03-24T10:00:00Z',
      end_time: '2026-03-24T10:30:00Z',
    });

    expect(result).toBeNull();
  });
});

describe('expireStaleOffers', () => {
  test('returns count of expired offers', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: {
        data: [{ id: 'wl-expired-1' }, { id: 'wl-expired-2' }],
        error: null,
      },
    });

    const count = await expireStaleOffers(sb);
    expect(count).toBe(2);
  });

  test('returns 0 when no stale offers', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: { data: [], error: null },
    });

    const count = await expireStaleOffers(sb);
    expect(count).toBe(0);
  });
});

describe('cancelWaitlistEntry', () => {
  test('does not throw on success', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: { data: null, error: null },
    });

    await expect(
      cancelWaitlistEntry(sb, 'wl-1', PATIENT_ID),
    ).resolves.toBeUndefined();
  });

  test('throws on error', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: { data: null, error: { message: 'not found' } },
    });

    await expect(
      cancelWaitlistEntry(sb, 'wl-1', PATIENT_ID),
    ).rejects.toThrow('Error cancelling waitlist');
  });
});

describe('getDoctorWaitlist', () => {
  test('returns waiting entries ordered by priority', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: {
        data: [
          { ...mockWaitlistEntry, id: 'wl-1', priority: 0 },
          { ...mockWaitlistEntry, id: 'wl-2', priority: 2 },
        ],
        error: null,
      },
    });

    const entries = await getDoctorWaitlist(sb, DOCTOR_ID);
    expect(entries.length).toBe(2);
  });
});
