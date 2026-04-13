import { describe, expect, it } from 'vitest';
import { markOverdueAppointmentsNoShow } from '../no-show-reaper';
import { createMockSupabase } from './mock-supabase';

describe('markOverdueAppointmentsNoShow', () => {
  it('returns the count from the RPC', async () => {
    const sb = createMockSupabase({}, {
      mark_overdue_appointments_no_show: { data: 3, error: null },
    });

    await expect(markOverdueAppointmentsNoShow(sb)).resolves.toBe(3);
  });

  it('throws when the RPC fails', async () => {
    const sb = createMockSupabase({}, {
      mark_overdue_appointments_no_show: { data: null, error: { message: 'rpc failed' } },
    });

    await expect(markOverdueAppointmentsNoShow(sb)).rejects.toThrow(
      'Error marking overdue appointments as no_show',
    );
  });
});
