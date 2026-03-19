import { test, expect, describe } from 'bun:test';
import { getAvailableSlots, getOpenSlots } from '../slots';
import { createMockSupabase } from './mock-supabase';

const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';

function makeAvailability(overrides: Record<string, unknown> = {}) {
  return {
    id: 'avail-1',
    doctor_id: DOCTOR_ID,
    day_of_week: 1, // lunes
    start_time: '09:00',
    end_time: '12:00',
    slot_duration: 30,
    is_active: true,
    location: 'Consultorio A',
    ...overrides,
  };
}

describe('getAvailableSlots', () => {
  test('generates slots from weekly availability', async () => {
    // 2026-03-23 is a Monday (day_of_week=1)
    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability({ day_of_week: 1 })],
        error: null,
      },
      doctor_availability_overrides: { data: [], error: null },
      appointments: { data: [], error: null },
    });

    const slots = await getAvailableSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: '2026-03-23',
      date_to: '2026-03-23',
    });

    // 09:00-12:00 with 30min slots = 6 slots
    expect(slots.length).toBe(6);
    expect(slots[0].is_available).toBe(true);
    expect(slots[0].duration_minutes).toBe(30);
    expect(slots[0].location).toBe('Consultorio A');
  });

  test('returns empty when no availability', async () => {
    const sb = createMockSupabase({
      doctor_availability: { data: [], error: null },
      doctor_availability_overrides: { data: [], error: null },
      appointments: { data: [], error: null },
    });

    const slots = await getAvailableSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: '2026-03-23',
      date_to: '2026-03-23',
    });

    expect(slots).toEqual([]);
  });

  test('marks booked slots as unavailable', async () => {
    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability({ day_of_week: 1 })],
        error: null,
      },
      doctor_availability_overrides: { data: [], error: null },
      appointments: {
        data: [
          {
            start_time: '2026-03-23T09:00:00.000Z',
            end_time: '2026-03-23T09:30:00.000Z',
            duration_minutes: 30,
            status: 'scheduled',
          },
        ],
        error: null,
      },
    });

    const slots = await getAvailableSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: '2026-03-23',
      date_to: '2026-03-23',
    });

    expect(slots.length).toBe(6);
    const bookedSlot = slots.find(s => s.start_time.includes('09:00'));
    expect(bookedSlot?.is_available).toBe(false);

    const freeSlot = slots.find(s => s.start_time.includes('09:30'));
    expect(freeSlot?.is_available).toBe(true);
  });

  test('respects override that marks day unavailable', async () => {
    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability({ day_of_week: 1 })],
        error: null,
      },
      doctor_availability_overrides: {
        data: [
          {
            id: 'over-1',
            doctor_id: DOCTOR_ID,
            override_date: '2026-03-23',
            is_available: false,
            start_time: null,
            end_time: null,
            reason: 'Vacaciones',
          },
        ],
        error: null,
      },
      appointments: { data: [], error: null },
    });

    const slots = await getAvailableSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: '2026-03-23',
      date_to: '2026-03-23',
    });

    expect(slots).toEqual([]);
  });

  test('uses override hours when available', async () => {
    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability({ day_of_week: 1 })],
        error: null,
      },
      doctor_availability_overrides: {
        data: [
          {
            id: 'over-1',
            doctor_id: DOCTOR_ID,
            override_date: '2026-03-23',
            is_available: true,
            start_time: '14:00',
            end_time: '16:00',
            reason: 'Guardia extra',
          },
        ],
        error: null,
      },
      appointments: { data: [], error: null },
    });

    const slots = await getAvailableSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: '2026-03-23',
      date_to: '2026-03-23',
    });

    // 14:00-16:00 with 30min = 4 slots
    expect(slots.length).toBe(4);
    expect(slots[0].start_time).toContain('14:00');
  });

  test('throws on supabase error', async () => {
    const sb = createMockSupabase({
      doctor_availability: { data: null, error: { message: 'DB down' } },
    });

    await expect(
      getAvailableSlots(sb, {
        doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
        date_from: '2026-03-23',
        date_to: '2026-03-23',
      }),
    ).rejects.toThrow('Error fetching availability');
  });
});

describe('getOpenSlots', () => {
  test('filters only available slots', async () => {
    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability({ day_of_week: 1 })],
        error: null,
      },
      doctor_availability_overrides: { data: [], error: null },
      appointments: {
        data: [
          {
            start_time: '2026-03-23T09:00:00.000Z',
            end_time: '2026-03-23T09:30:00.000Z',
            duration_minutes: 30,
            status: 'scheduled',
          },
        ],
        error: null,
      },
    });

    const openSlots = await getOpenSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: '2026-03-23',
      date_to: '2026-03-23',
    });

    // 6 total - 1 booked = 5 open
    expect(openSlots.length).toBe(5);
    expect(openSlots.every(s => s.is_available)).toBe(true);
  });
});
