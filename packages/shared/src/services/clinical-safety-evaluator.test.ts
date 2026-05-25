import { describe, it, expect } from 'vitest';
import { getEvidenceValue, evaluateClinicalSafety } from './clinical-safety-evaluator';
import type { 
  ClinicalEvidence, 
  ClinicalResolutionCriterion, 
  ClinicalRedFlag 
} from '@autamedica/types';

describe('Clinical Safety Evaluator Engine', () => {

  describe('getEvidenceValue (LOINC / terminology extractor)', () => {
    it('should extract correct troponin value from history sorted by timestamp', () => {
      const evidence: ClinicalEvidence = {
        troponinHistory: [
          { timestamp: '2026-05-25T01:00:00Z', valueNgMl: 0.15 },
          { timestamp: '2026-05-25T03:00:00Z', valueNgMl: 0.85 },
          { timestamp: '2026-05-25T02:00:00Z', valueNgMl: 0.45 },
        ]
      };
      
      const val = getEvidenceValue(evidence, '10839-9');
      expect(val).toBe(0.85); // Latest measurement by date should be returned
    });

    it('should extract SpO2 from LOINC code', () => {
      const evidence: ClinicalEvidence = { oxygenSaturationPct: 98 };
      expect(getEvidenceValue(evidence, '2708-6')).toBe(98);
    });

    it('should extract ECG ST Elevation from LOINC code', () => {
      const evidence: ClinicalEvidence = { ecgStElevationMm: 1.5 };
      expect(getEvidenceValue(evidence, '85805-2')).toBe(1.5);
    });

    it('should extract Glasgow scale from LOINC code', () => {
      const evidence: ClinicalEvidence = { glasgowComaScale: 15 };
      expect(getEvidenceValue(evidence, '9269-2')).toBe(15);
    });

    it('should extract Pain VAS scale from custom code or VAS', () => {
      const evidence: ClinicalEvidence = { painScaleVas: 4 };
      expect(getEvidenceValue(evidence, 'PAIN_VAS')).toBe(4);
      expect(getEvidenceValue(evidence, 'VAS')).toBe(4);
    });

    it('should fallback to custom parameters dictionary', () => {
      const evidence: ClinicalEvidence = {
        customParameters: {
          'systolic_bp': 120,
          'diastolic_bp': 80
        }
      };
      expect(getEvidenceValue(evidence, 'systolic_bp')).toBe(120);
      expect(getEvidenceValue(evidence, 'diastolic_bp')).toBe(80);
    });

    it('should return undefined if LOINC code is unknown or evidence missing', () => {
      const evidence: ClinicalEvidence = {};
      expect(getEvidenceValue(evidence, '10839-9')).toBeUndefined();
      expect(getEvidenceValue(evidence, 'UNKNOWN_LOINC')).toBeUndefined();
    });
  });

  describe('evaluateClinicalSafety', () => {

    describe('Piloto 1: Cefaleas (Headache) & Red Flags screening', () => {
      const headacheRedFlags: ClinicalRedFlag[] = [
        {
          id: 'rf1',
          rule_version_id: 'rv1',
          flag_key: 'hasThunderclapOnset',
          flag_display: 'Inicio subito en estallido (Thunderclap)',
          created_at: '2026-05-25T00:00:00Z'
        },
        {
          id: 'rf2',
          rule_version_id: 'rv1',
          flag_key: 'hasMeningism',
          flag_display: 'Signos meningeos (Rigidez de nuca)',
          created_at: '2026-05-25T00:00:00Z'
        }
      ];

      const headacheCriteria: ClinicalResolutionCriterion[] = [
        {
          id: 'c1',
          rule_version_id: 'rv1',
          required_observation_id: 'ro1',
          operator: '<=',
          threshold_value: 3, // Pain scale <= 3
          relative_target_pct: null,
          created_at: '2026-05-25T00:00:00Z',
          loinc_code: 'PAIN_VAS'
        } as any
      ];

      it('should allow resolution when criteria is met and no red flags are active', () => {
        const evidence: ClinicalEvidence = {
          painScaleVas: 2,
          hasThunderclapOnset: false,
          hasMeningism: false
        };

        const res = evaluateClinicalSafety(evidence, headacheCriteria, headacheRedFlags);
        expect(res.isValid).toBe(true);
      });

      it('should block resolution if pain scale exceeds criteria threshold', () => {
        const evidence: ClinicalEvidence = {
          painScaleVas: 5,
          hasThunderclapOnset: false,
          hasMeningism: false
        };

        const res = evaluateClinicalSafety(evidence, headacheCriteria, headacheRedFlags);
        expect(res.isValid).toBe(false);
        expect(res.reason).toContain('Límite superado');
      });

      it('should block resolution instantly if sudden thunderclap onset is reported', () => {
        const evidence: ClinicalEvidence = {
          painScaleVas: 1,
          hasThunderclapOnset: true,
          hasMeningism: false
        };

        const res = evaluateClinicalSafety(evidence, headacheCriteria, headacheRedFlags);
        expect(res.isValid).toBe(false);
        expect(res.reason).toContain('Inicio subito en estallido (Thunderclap)');
      });

      it('should block resolution instantly if meningism is reported', () => {
        const evidence: ClinicalEvidence = {
          painScaleVas: 2,
          hasThunderclapOnset: false,
          hasMeningism: true
        };

        const res = evaluateClinicalSafety(evidence, headacheCriteria, headacheRedFlags);
        expect(res.isValid).toBe(false);
        expect(res.reason).toContain('Signos meningeos (Rigidez de nuca)');
      });
    });

    describe('IAM: Infarto Agudo de Miocardio Relative telemetry & kinetics', () => {
      const iamCriteria: ClinicalResolutionCriterion[] = [
        {
          id: 'c1',
          rule_version_id: 'rv2',
          required_observation_id: 'ro2',
          operator: 'relative_reduction_pct',
          threshold_value: null,
          relative_target_pct: 50, // Requires ST segment relative reduction >= 50%
          created_at: '2026-05-25T00:00:00Z',
          loinc_code: '85805-2'
        } as any,
        {
          id: 'c2',
          rule_version_id: 'rv2',
          required_observation_id: 'ro3',
          operator: 'trend_descending',
          threshold_value: null,
          relative_target_pct: null,
          created_at: '2026-05-25T00:00:00Z',
          loinc_code: '10839-9'
        } as any
      ];

      it('should allow resolution when ST segments descend >= 50% and troponin kinetic curves go down', () => {
        const evidence: ClinicalEvidence = {
          ecgStElevationMm: 1.0,      // Current ST elevation
          peakEcgStElevationMm: 3.0,  // Pre-intervention peak ST elevation (reduction of 66.7%)
          troponinHistory: [
            { timestamp: '2026-05-25T01:00:00Z', valueNgMl: 2.50 },
            { timestamp: '2026-05-25T02:00:00Z', valueNgMl: 1.80 } // Descending curve
          ]
        };

        const res = evaluateClinicalSafety(evidence, iamCriteria, []);
        expect(res.isValid).toBe(true);
      });

      it('should block resolution when ST segments descend less than target (e.g. 25% decrease)', () => {
        const evidence: ClinicalEvidence = {
          ecgStElevationMm: 2.5,
          peakEcgStElevationMm: 3.0,  // Reduction of only 16.7%
          troponinHistory: [
            { timestamp: '2026-05-25T01:00:00Z', valueNgMl: 2.50 },
            { timestamp: '2026-05-25T02:00:00Z', valueNgMl: 1.80 }
          ]
        };

        const res = evaluateClinicalSafety(evidence, iamCriteria, []);
        expect(res.isValid).toBe(false);
        expect(res.reason).toContain('Resolución insuficiente');
      });

      it('should block resolution if troponin curve is ascending (indicates active necrosis)', () => {
        const evidence: ClinicalEvidence = {
          ecgStElevationMm: 1.0,
          peakEcgStElevationMm: 3.0,
          troponinHistory: [
            { timestamp: '2026-05-25T01:00:00Z', valueNgMl: 1.80 },
            { timestamp: '2026-05-25T02:00:00Z', valueNgMl: 2.90 } // Rising curve!
          ]
        };

        const res = evaluateClinicalSafety(evidence, iamCriteria, []);
        expect(res.isValid).toBe(false);
        expect(res.reason).toContain('Curva ascendente detectada');
      });

      it('should block if troponin history has less than 2 points to analyze trend', () => {
        const evidence: ClinicalEvidence = {
          ecgStElevationMm: 1.0,
          peakEcgStElevationMm: 3.0,
          troponinHistory: [
            { timestamp: '2026-05-25T02:00:00Z', valueNgMl: 2.90 }
          ]
        };

        const res = evaluateClinicalSafety(evidence, iamCriteria, []);
        expect(res.isValid).toBe(false);
        expect(res.reason).toContain('Muestras insuficientes');
      });
    });
  });
});
