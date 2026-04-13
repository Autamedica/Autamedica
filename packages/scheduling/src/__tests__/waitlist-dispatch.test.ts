import { describe, expect, it } from 'vitest';
import { DEFAULT_OPENCLAW_CONFIG } from '../openclaw';
import { processUnsentWaitlistOffers } from '../waitlist-dispatch';
import { createMockSupabase } from './mock-supabase';

describe('processUnsentWaitlistOffers', () => {
  it('marks offers as sent in dry run mode', async () => {
    const sb = createMockSupabase({
      appointment_waitlist: {
        data: [
          {
            id: 'wl-1',
            offered_at: '2026-04-13T10:00:00Z',
            offered_start_time: '2026-04-14T14:00:00Z',
            offered_end_time: '2026-04-14T14:30:00Z',
            expires_at: '2026-04-13T16:00:00Z',
            offer_sent_at: null,
            patients: {
              id: 'p-1',
              user_id: 'u-1',
              profiles: { first_name: 'Ana', phone: '+5491111111111' },
            },
            doctors: {
              id: 'd-1',
              user_id: 'u-2',
              profiles: { first_name: 'Lia', last_name: 'Suarez' },
            },
          },
        ],
        error: null,
      },
    });

    const result = await processUnsentWaitlistOffers(sb, {
      openclaw: { ...DEFAULT_OPENCLAW_CONFIG, token: 'token' },
      dryRun: true,
    });

    expect(result.processed).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.errors).toEqual([]);
  });
});
