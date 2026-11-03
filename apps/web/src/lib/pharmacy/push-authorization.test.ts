import { describe, expect, it } from 'vitest';
import { trustedPushAuthorization } from '../../../../../supabase/functions/_shared/push-authorization';

const credentials = { cronSecret: 'synthetic-private-cron', serviceRoleKey: 'synthetic-private-service' };
describe('privileged dispatch notification authorization', () => {
  it.each([null, '', 'Bearer ', 'Bearer synthetic-public-anon', 'synthetic-private-service'])('rejects public or malformed credentials: %s', header => {
    expect(trustedPushAuthorization(header, credentials)).toBe(false);
  });
  it('does not authorize empty configured credentials', () => {
    expect(trustedPushAuthorization('Bearer anything', {})).toBe(false);
  });
  it.each(Object.values(credentials))('accepts configured private service credentials', token => {
    expect(trustedPushAuthorization(`Bearer ${token}`, credentials)).toBe(true);
  });
});
