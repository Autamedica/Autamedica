import { describe, it, expect, vi, afterEach } from 'vitest';
import { computeAgeFromIso, normalizeGender, deriveAgeAndGender } from '../demographics';

describe('computeAgeFromIso', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for null input', () => {
    expect(computeAgeFromIso(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(computeAgeFromIso(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(computeAgeFromIso('')).toBeNull();
  });

  it('returns null for invalid ISO date', () => {
    expect(computeAgeFromIso('not-a-date')).toBeNull();
  });

  it('computes correct age when birthday has passed this year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15'));
    expect(computeAgeFromIso('1990-01-15')).toBe(36);
  });

  it('computes correct age when birthday has not passed this year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15'));
    expect(computeAgeFromIso('1990-09-20')).toBe(35);
  });

  it('computes correct age on exact birthday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-22'));
    expect(computeAgeFromIso('1990-03-22')).toBe(36);
  });

  it('returns null for age >= 140', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01'));
    expect(computeAgeFromIso('1800-01-01')).toBeNull();
  });

  it('returns null for future birth date (negative age)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01'));
    expect(computeAgeFromIso('2030-01-01')).toBeNull();
  });

  it('returns 0 for a baby born this year', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15'));
    expect(computeAgeFromIso('2026-03-01')).toBe(0);
  });
});

describe('normalizeGender', () => {
  it('returns null for null input', () => {
    expect(normalizeGender(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizeGender(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(normalizeGender('')).toBeNull();
  });

  it('returns null for unrecognized gender string', () => {
    expect(normalizeGender('other')).toBeNull();
  });

  it('normalizes "female" to female', () => {
    expect(normalizeGender('female')).toBe('female');
  });

  it('normalizes "f" to female', () => {
    expect(normalizeGender('f')).toBe('female');
  });

  it('normalizes "mujer" to female', () => {
    expect(normalizeGender('mujer')).toBe('female');
  });

  it('normalizes "femenino" to female', () => {
    expect(normalizeGender('femenino')).toBe('female');
  });

  it('normalizes "male" to male', () => {
    expect(normalizeGender('male')).toBe('male');
  });

  it('normalizes "m" to male', () => {
    expect(normalizeGender('m')).toBe('male');
  });

  it('normalizes "hombre" to male', () => {
    expect(normalizeGender('hombre')).toBe('male');
  });

  it('normalizes "masculino" to male', () => {
    expect(normalizeGender('masculino')).toBe('male');
  });

  it('is case-insensitive', () => {
    expect(normalizeGender('FEMALE')).toBe('female');
    expect(normalizeGender('Male')).toBe('male');
    expect(normalizeGender('MUJER')).toBe('female');
  });

  it('trims whitespace', () => {
    expect(normalizeGender('  female  ')).toBe('female');
    expect(normalizeGender(' m ')).toBe('male');
  });
});

describe('deriveAgeAndGender', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for both when no data provided', () => {
    const result = deriveAgeAndGender(null, null);
    expect(result).toEqual({ age: null, gender: null });
  });

  it('returns null for both when called with no arguments', () => {
    const result = deriveAgeAndGender();
    expect(result).toEqual({ age: null, gender: null });
  });

  it('uses primary data when available', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15'));
    const result = deriveAgeAndGender(
      { birthDate: '1990-01-01', gender: 'male' },
      { birthDate: '2000-01-01', gender: 'female' },
    );
    expect(result.age).toBe(36);
    expect(result.gender).toBe('male');
  });

  it('falls back to secondary data when primary is null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15'));
    const result = deriveAgeAndGender(
      { birthDate: null, gender: null },
      { birthDate: '2000-01-01', gender: 'mujer' },
    );
    expect(result.age).toBe(26);
    expect(result.gender).toBe('female');
  });

  it('uses primary birthDate and fallback gender when primary gender is null', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15'));
    const result = deriveAgeAndGender(
      { birthDate: '1985-06-01', gender: null },
      { birthDate: null, gender: 'hombre' },
    );
    expect(result.age).toBe(41);
    expect(result.gender).toBe('male');
  });
});
