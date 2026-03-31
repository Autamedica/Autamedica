import { it, expect, describe } from 'vitest';
import { getAvailableSlots, getOpenSlots } from '../slots';
import { createMockSupabase } from './mock-supabase';

const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';

/**
 * Compute the local day-of-week that slots.ts will use for a given
 * date string. This mirrors what the source does: `new Date(dateStr).getDay()`.
 *
 * Also returns the formatted date string that `formatDate` produces locally,
 * since `new Date('YYYY-MM-DD')` is parsed as UTC and may shift when
 * rendered in local time.
 */
function localDayInfo(dateStr: string) {
  const d = new Date(dateStr);
  return {
    dayOfWeek: d.getDay(),
    // formatDate equivalent (local)
    localDateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

// Pick a reference date. The source interprets it via local TZ.
const REF_DATE = '2026-03-23';
const { dayOfWeek: REF_DOW, localDateStr: REF_LOCAL } = localDayInfo(REF_DATE);

function makeAvailability(overrides: Record<string, unknown> = {}) {
  return {
    id: 'avail-1',
    doctor_id: DOCTOR_ID,
    day_of_week: REF_DOW, // matches what getDay() returns locally
    start_time: '09:00',
    end_time: '12:00',
    slot_duration: 30,
    is_active: true,
    location: 'Consultorio A',
    ...overrides,
  };
}

describe('getAvailableSlots', () => {
  it('generates slots from weekly availability', async () => {
    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability()],
        error: null,
      },
      doctor_availability_overrides: { data: [], error: null },
      appointments: { data: [], error: null },
    });

    const slots = await getAvailableSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: REF_DATE,
      date_to: REF_DATE,
    });

    // 09:00-12:00 with 30min slots = 6 slots
    expect(slots.length).toBe(6);
    expect(slots[0].is_available).toBe(true);
    expect(slots[0].duration_minutes).toBe(30);
    expect(slots[0].location).toBe('Consultorio A');
  });

  it('returns empty when no availability', async () => {
    const sb = createMockSupabase({
      doctor_availability: { data: [], error: null },
      doctor_availability_overrides: { data: [], error: null },
      appointments: { data: [], error: null },
    });

    const slots = await getAvailableSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: REF_DATE,
      date_to: REF_DATE,
    });

    expect(slots).toEqual([]);
  });

  it('marks booked slots as unavailable', async () => {
    // Build the booked appointment time to match the slot at 09:00 local.
    // The source creates slots via `new Date('${localDateStr}T09:00:00')`.toISOString()
    const bookedStart = new Date(`${REF_LOCAL}T09:00:00`).toISOString();
    const bookedEnd = new Date(`${REF_LOCAL}T09:30:00`).toISOString();

    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability()],
        error: null,
      },
      doctor_availability_overrides: { data: [], error: null },
      appointments: {
        data: [
          {
            start_time: bookedStart,
            end_time: bookedEnd,
            duration_minutes: 30,
            status: 'scheduled',
          },
        ],
        error: null,
      },
    });

    const slots = await getAvailableSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: REF_DATE,
      date_to: REF_DATE,
    });

    expect(slots.length).toBe(6);
    // First slot (09:00 local) should be booked
    expect(slots[0].is_available).toBe(false);
    // Second slot (09:30 local) should be free
    expect(slots[1].is_available).toBe(true);
  });

  it('respects override that marks day unavailable', async () => {
    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability()],
        error: null,
      },
      doctor_availability_overrides: {
        data: [
          {
            id: 'over-1',
            doctor_id: DOCTOR_ID,
            override_date: REF_LOCAL, // must match formatDate output
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
      date_from: REF_DATE,
      date_to: REF_DATE,
    });

    expect(slots).toEqual([]);
  });

  it('uses override hours when available', async () => {
    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability()],
        error: null,
      },
      doctor_availability_overrides: {
        data: [
          {
            id: 'over-1',
            doctor_id: DOCTOR_ID,
            override_date: REF_LOCAL,
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
      date_from: REF_DATE,
      date_to: REF_DATE,
    });

    // 14:00-16:00 with 30min = 4 slots
    expect(slots.length).toBe(4);
    // Verify first slot matches 14:00 local time
    const expected14 = new Date(`${REF_LOCAL}T14:00:00`).toISOString();
    expect(slots[0].start_time).toBe(expected14);
  });

  it('throws on supabase error', async () => {
    const sb = createMockSupabase({
      doctor_availability: { data: null, error: { message: 'DB down' } },
    });

    await expect(
      getAvailableSlots(sb, {
        doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
        date_from: REF_DATE,
        date_to: REF_DATE,
      }),
    ).rejects.toThrow('Error fetching availability');
  });
});

describe('getOpenSlots', () => {
  it('filters only available slots', async () => {
    const bookedStart = new Date(`${REF_LOCAL}T09:00:00`).toISOString();
    const bookedEnd = new Date(`${REF_LOCAL}T09:30:00`).toISOString();

    const sb = createMockSupabase({
      doctor_availability: {
        data: [makeAvailability()],
        error: null,
      },
      doctor_availability_overrides: { data: [], error: null },
      appointments: {
        data: [
          {
            start_time: bookedStart,
            end_time: bookedEnd,
            duration_minutes: 30,
            status: 'scheduled',
          },
        ],
        error: null,
      },
    });

    const openSlots = await getOpenSlots(sb, {
      doctor_id: DOCTOR_ID as import('@autamedica/types').UUID,
      date_from: REF_DATE,
      date_to: REF_DATE,
    });

    // 6 total - 1 booked = 5 open
    expect(openSlots.length).toBe(5);
    expect(openSlots.every(s => s.is_available)).toBe(true);
  });
});
