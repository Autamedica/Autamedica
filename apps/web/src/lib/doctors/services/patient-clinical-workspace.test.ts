import { describe, expect, it } from 'vitest';
import {
  computeBmi,
  computePrescriptionRenewalStatus,
  computeVitalAlerts,
  normalizeClinicalRecordType,
  resolveVitalRecordType,
  validateVitalRanges,
} from './patient-clinical-workspace';

describe('patient-clinical-workspace helpers', () => {
  it('normalizes medical_records types to safe DB constraint intersection', () => {
    expect(normalizeClinicalRecordType('consultation')).toBe('consultation');
    expect(normalizeClinicalRecordType('diagnosis')).toBe('diagnosis');
    expect(normalizeClinicalRecordType('lab_result')).toBe('lab_result');
    expect(normalizeClinicalRecordType('imaging')).toBe('imaging');
    expect(normalizeClinicalRecordType('follow_up')).toBe('consultation');
    expect(normalizeClinicalRecordType('unknown')).toBe('consultation');
  });

  it('validates blood pressure pairing and physiological ranges', () => {
    expect(validateVitalRanges({ bloodPressureSystolic: 120 })).toBe(
      'vital_bp_requires_systolic_and_diastolic',
    );
    expect(validateVitalRanges({ bloodPressureSystolic: 80, bloodPressureDiastolic: 90 })).toBe(
      'vital_diastolic_must_be_below_systolic',
    );
    expect(validateVitalRanges({ oxygenSaturation: 40 })).toBe(
      'vital_oxygen_saturation_out_of_range',
    );
    expect(validateVitalRanges({})).toBe('vital_at_least_one_metric_required');
    expect(
      validateVitalRanges({ bloodPressureSystolic: 120, bloodPressureDiastolic: 80 }),
    ).toBeNull();
  });

  it('resolves vital_signs.type accurately for single and composite inputs', () => {
    expect(
      resolveVitalRecordType({ bloodPressureSystolic: 125, bloodPressureDiastolic: 82 }),
    ).toBe('blood_pressure');
    expect(resolveVitalRecordType({ heartRate: 76 })).toBe('heart_rate');
    expect(
      resolveVitalRecordType({
        bloodPressureSystolic: 130,
        bloodPressureDiastolic: 85,
        heartRate: 88,
      }),
    ).toBe('composite');
  });

  it('computes BMI and clinical abnormality alerts', () => {
    expect(computeBmi(70, 175)).toBe(22.9);
    expect(computeBmi(null, 175)).toBeNull();

    const alerts = computeVitalAlerts({
      bloodPressureSystolic: 185,
      bloodPressureDiastolic: 122,
      oxygenSaturation: 88,
      temperature: 39.2,
      painScale: 9,
    });
    expect(alerts.map((a) => a.code)).toEqual([
      'bp_crisis',
      'spo2_critical',
      'temp_high_fever',
      'pain_severe',
    ]);
    expect(alerts.every((a) => a.severity === 'critical')).toBe(true);
  });

  it('computes prescription renewal status and prefill for expired, expiring, active, and cancelled rows', () => {
    const now = new Date('2026-11-27T12:00:00.000Z');

    const expired = computePrescriptionRenewalStatus(
      {
        id: 'rx-1',
        status: 'active',
        created_at: '2026-10-01T12:00:00.000Z',
        clinical_data: {
          diagnosis: 'Hipertensión arterial',
          items: [{ generic_name: 'Enalapril', dosage: '10 mg', frequency: '12', duration: '30 días' }],
        },
      },
      now,
    );
    expect(expired.renewalStatus).toBe('expired');
    expect(expired.canRenew).toBe(true);
    expect(expired.prefill.medicationName).toBe('Enalapril');

    const expiring = computePrescriptionRenewalStatus(
      {
        id: 'rx-2',
        status: 'active',
        created_at: '2026-11-01T12:00:00.000Z',
        expires_at: '2026-12-01T12:00:00.000Z',
        clinical_data: { medication_name: 'Losartán', dosage: '50 mg' },
      },
      now,
    );
    expect(expiring.renewalStatus).toBe('expiring_soon');
    expect(expiring.daysRemaining).toBe(4);
    expect(expiring.canRenew).toBe(true);

    const cancelled = computePrescriptionRenewalStatus(
      {
        id: 'rx-3',
        status: 'cancelled',
        created_at: '2026-11-20T12:00:00.000Z',
      },
      now,
    );
    expect(cancelled.renewalStatus).toBe('cancelled');
    expect(cancelled.canRenew).toBe(false);
  });
});
