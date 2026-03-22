import { test, expect, describe } from 'bun:test';
import { predictNoShowProbability } from '../noshow-predictor';
import { createMockSupabase } from './mock-supabase';

const PATIENT_ID = '22222222-2222-2222-2222-222222222222';
const DOCTOR_ID = '11111111-1111-1111-1111-111111111111';

describe('predictNoShowProbability', () => {
  test('returns baseline rate with no history', async () => {
    const sb = createMockSupabase({
      appointment_history: { data: [], error: null },
    });

    const result = await predictNoShowProbability(sb, PATIENT_ID, DOCTOR_ID, 1, 9);

    expect(result.probability).toBeCloseTo(0.15, 1);
    expect(result.risk_level).toBe('low');
    expect(result.patient_id).toBe(PATIENT_ID);
    expect(result.doctor_id).toBe(DOCTOR_ID);
    expect(result.factors.length).toBe(3);
  });

  test('returns higher probability for patient with no-show history', async () => {
    // Patient with 50% no-show rate (5 completed, 5 no_show)
    const patientHistory = [
      ...Array(5).fill({ action: 'completed' }),
      ...Array(5).fill({ action: 'no_show' }),
    ];

    const sb = createMockSupabase({
      appointment_history: { data: patientHistory, error: null },
    });

    const result = await predictNoShowProbability(sb, PATIENT_ID, DOCTOR_ID, 1, 9);

    // Patient factor (weight 0.5) should be high, pushing overall up
    const patientFactor = result.factors.find(f => f.name === 'patient_history');
    expect(patientFactor).toBeDefined();
    expect(patientFactor?.value).toBeGreaterThan(0.15);
    expect(result.probability).toBeGreaterThan(0.15);
  });

  test('probability is clamped between 0 and 1', async () => {
    const sb = createMockSupabase({
      appointment_history: { data: [], error: null },
    });

    const result = await predictNoShowProbability(sb, PATIENT_ID, DOCTOR_ID, 1, 9);
    expect(result.probability).toBeGreaterThanOrEqual(0);
    expect(result.probability).toBeLessThanOrEqual(1);
  });

  test('risk_level thresholds are correct', async () => {
    const sb = createMockSupabase({
      appointment_history: { data: [], error: null },
    });

    const result = await predictNoShowProbability(sb, PATIENT_ID, DOCTOR_ID, 1, 9);

    // With no data, baseline ~15% → low
    if (result.probability < 0.2) {
      expect(result.risk_level).toBe('low');
    } else if (result.probability < 0.4) {
      expect(result.risk_level).toBe('medium');
    } else {
      expect(result.risk_level).toBe('high');
    }
  });

  test('factors have correct weights summing to 1', async () => {
    const sb = createMockSupabase({
      appointment_history: { data: [], error: null },
    });

    const result = await predictNoShowProbability(sb, PATIENT_ID, DOCTOR_ID, 1, 9);
    const totalWeight = result.factors.reduce((sum, f) => sum + f.weight, 0);
    expect(totalWeight).toBeCloseTo(1.0, 5);
  });

  test('handles DB errors gracefully (falls back to baseline)', async () => {
    const sb = createMockSupabase({
      appointment_history: { data: null, error: { message: 'timeout' } },
    });

    // Should not throw - returns baseline when data is unavailable
    const result = await predictNoShowProbability(sb, PATIENT_ID, DOCTOR_ID, 1, 9);
    expect(result.probability).toBeCloseTo(0.15, 1);
  });
});
