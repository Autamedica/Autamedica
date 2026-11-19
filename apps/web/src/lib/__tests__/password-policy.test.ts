import { describe, expect, it } from 'vitest';
import { meetsPasswordMinimum, MIN_PASSWORD_LENGTH } from '../auth/password-policy';

describe('Supabase password minimum', () => {
  it('matches the production Auth minimum', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
  });

  it('rejects passwords shorter than the production minimum', () => {
    expect(meetsPasswordMinimum('a'.repeat(11))).toBe(false);
  });

  it('accepts passwords at the production minimum', () => {
    expect(meetsPasswordMinimum('a'.repeat(12))).toBe(true);
  });
});
