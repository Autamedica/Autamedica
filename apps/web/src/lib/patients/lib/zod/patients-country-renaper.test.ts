import { describe, expect, it } from 'vitest';
import { PatientSnakeSchema } from './patients';

describe('RENAPER country is explicit and fail-closed in patient parsing', () => {
  const countrySchema = PatientSnakeSchema.shape.care_country;
  it('preserves Argentina as a distinct care-country', () => {
    expect(countrySchema.parse('AR')).toBe('AR');
  });
  it('preserves Brazil without granting RENAPER eligibility', () => {
    expect(countrySchema.parse('BR')).toBe('BR');
  });
  it('preserves a missing country without inferring country from phone or locale', () => {
    expect(countrySchema.parse(null)).toBe(null);
    expect(countrySchema.parse(undefined)).toBe(undefined);
  });
  it('rejects unsupported country values', () => {
    expect(countrySchema.safeParse('US').success).toBe(false);
  });
});
