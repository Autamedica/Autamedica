import { it, expect, describe } from 'vitest';
import { checkConflict } from '../conflicts';
import { createMockSupabase } from './mock-supabase';

const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';

describe('checkConflict', () => {
  it('returns true when conflict exists', async () => {
    const sb = createMockSupabase({
      appointments: {
        data: [{ id: 'existing-appt' }],
        error: null,
      },
    });

    const hasConflict = await checkConflict(
      sb,
      DOCTOR_ID,
      '2026-03-23T09:00:00Z',
      '2026-03-23T09:30:00Z',
    );

    expect(hasConflict).toBe(true);
  });

  it('returns false when no conflict', async () => {
    const sb = createMockSupabase({
      appointments: { data: [], error: null },
    });

    const hasConflict = await checkConflict(
      sb,
      DOCTOR_ID,
      '2026-03-23T09:00:00Z',
      '2026-03-23T09:30:00Z',
    );

    expect(hasConflict).toBe(false);
  });

  it('throws on DB error', async () => {
    const sb = createMockSupabase({
      appointments: { data: null, error: { message: 'timeout' } },
    });

    await expect(
      checkConflict(sb, DOCTOR_ID, '2026-03-23T09:00:00Z', '2026-03-23T09:30:00Z'),
    ).rejects.toThrow('Error checking conflict');
  });
});
