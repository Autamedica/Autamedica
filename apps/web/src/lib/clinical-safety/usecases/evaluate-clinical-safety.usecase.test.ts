import { describe, it, expect, vi, beforeEach } from 'vitest';
import { evaluateClinicalSafetyUseCase } from './evaluate-clinical-safety.usecase';
import type { 
  ClinicalRule, 
  ClinicalRuleVersion, 
  ClinicalRuleCondition, 
  ClinicalRequiredObservation, 
  ClinicalResolutionCriterion
} from '@autamedica/types';
import type { 
  IClinicalRulesRepository, 
  ClinicalEvidence
} from '@autamedica/types/ports';

const { mockEmit } = vi.hoisted(() => ({
  mockEmit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@autamedica/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@autamedica/shared')>();
  return {
    ...original,
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
    domainEvents: { emit: mockEmit },
  };
});

describe('EvaluateClinicalSafetyUseCase', () => {
  beforeEach(() => {
    mockEmit.mockClear();
  });

  const mockIncident = {
    id: 'incident-123',
    patient_id: 'patient-abc',
    doctor_id: 'doctor-xyz',
    snomed_concept_id: '57054005', // Acute Myocardial Infarction SNOMED
    setting: 'outpatient' as const,
    severity: 'high' as const,
    status: 'open',
    diagnosed_at: '2026-05-25T01:00:00Z',
    sla_deadline: '2026-05-25T01:05:00Z',
  };

  const mockRule: ClinicalRule = {
    id: 'rule-iam',
    name: 'Infarto Agudo de Miocardio Safety Shield',
    snomed_concept_id: '57054005',
    cie10_code: 'I21.9',
    condition_display: 'Infarto Agudo de Miocardio',
    risk_level: 'high',
    status: 'active',
    clinical_source: 'AHA 2023 Guidelines',
    responsible_doctor_id: 'doc-val-id',
    effective_from: '2026-01-01T00:00:00Z',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const mockVersion: ClinicalRuleVersion = {
    id: 'version-iam-v1',
    rule_id: 'rule-iam',
    version_number: 1,
    status: 'active',
    created_by: 'doc-val-id',
    created_at: '2026-01-01T00:00:00Z',
  };

  const mockCondition: ClinicalRuleCondition = {
    id: 'cond-iam-outpatient',
    rule_version_id: 'version-iam-v1',
    setting: 'outpatient',
    sla_duration: '5 minutes',
    verification_frequency: '1 minute',
    escalation_action: 'notify_chief',
    blocks_closure: true,
    requires_override: true,
  };

  const mockRequiredObservation: ClinicalRequiredObservation = {
    id: 'obs-st',
    rule_version_id: 'version-iam-v1',
    parameter_name: 'ecg_st_segment',
    loinc_code: '85805-2',
    is_required: true,
    created_at: '2026-01-01T00:00:00Z',
  };

  const mockCriterion: ClinicalResolutionCriterion = {
    id: 'crit-st-reduction',
    rule_version_id: 'version-iam-v1',
    required_observation_id: 'obs-st',
    operator: 'relative_reduction_pct',
    threshold_value: null,
    relative_target_pct: 50,
    created_at: '2026-01-01T00:00:00Z',
  } as any;

  function makeMockRulesRepo(): IClinicalRulesRepository {
    return {
      getRuleBySnomedOrCie10: vi.fn().mockResolvedValue(mockRule),
      getActiveVersion: vi.fn().mockResolvedValue(mockVersion),
      getConditions: vi.fn().mockResolvedValue([mockCondition]),
      getRequiredObservations: vi.fn().mockResolvedValue([mockRequiredObservation]),
      getResolutionCriteria: vi.fn().mockResolvedValue([mockCriterion]),
      getRedFlags: vi.fn().mockResolvedValue([]),
    };
  }

  function makeMockSupabase(queryMock: any, rpcMock: any): any {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockIncident, error: null }),
          }),
        }),
      }),
      rpc: vi.fn().mockResolvedValue({ data: rpcMock, error: null }),
    };
  }

  it('allows closure when dynamic clinical criteria (>= 50% relative ST reduction) is satisfied', async () => {
    const rulesRepo = makeMockRulesRepo();
    const mockTxResult = {
      success: true,
      execution_id: 'exec-999',
      override_id: null,
      outbox_id: 'outbox-888',
    };
    const supabase = makeMockSupabase(mockIncident, mockTxResult);

    const evidence: ClinicalEvidence = {
      ecgStElevationMm: 1.0,     // Current ST elevation
      peakEcgStElevationMm: 3.0, // Pre-intervention peak (reduction of 66.7% > 50%)
    };

    const res = await evaluateClinicalSafetyUseCase(
      { supabase, clinicalRulesRepo: rulesRepo },
      { incidentId: 'incident-123', evidence }
    );

    expect(res.success).toBe(true);
    expect(res.isValid).toBe(true);
    expect(res.recommendation).toBe('allow_closure');
    expect(res.executionId).toBe('exec-999');
    expect(res.overrideId).toBeNull();
    expect(res.outboxId).toBe('outbox-888');

    // Confirm execution RPC was called with allow_closure
    expect(supabase.rpc).toHaveBeenCalledWith(
      'log_clinical_rule_evaluation_transaction',
      expect.objectContaining({
        p_recommendation: 'allow_closure',
      })
    );

    // Confirm domain events are emitted
    expect(mockEmit).toHaveBeenCalledWith('clinical.safety_rule_evaluated', expect.objectContaining({
      recommendation: 'allow_closure',
      isValid: true,
    }));
  });

  it('blocks closure when clinical criteria is unsatisfied and no override justification is given', async () => {
    const rulesRepo = makeMockRulesRepo();
    const mockTxResult = {
      success: true,
      execution_id: 'exec-888',
      override_id: null,
      outbox_id: 'outbox-777',
    };
    const supabase = makeMockSupabase(mockIncident, mockTxResult);

    const evidence: ClinicalEvidence = {
      ecgStElevationMm: 2.5,     // Current elevation
      peakEcgStElevationMm: 3.0, // Reduction of only 16.7% (< 50% target)
    };

    const res = await evaluateClinicalSafetyUseCase(
      { supabase, clinicalRulesRepo: rulesRepo },
      { incidentId: 'incident-123', evidence }
    );

    expect(res.success).toBe(true);
    expect(res.isValid).toBe(false);
    expect(res.recommendation).toBe('block_closure');
    expect(res.executionId).toBe('exec-888');
    expect(res.overrideId).toBeNull();

    // Confirm execution RPC logged block_closure
    expect(supabase.rpc).toHaveBeenCalledWith(
      'log_clinical_rule_evaluation_transaction',
      expect.objectContaining({
        p_recommendation: 'block_closure',
      })
    );
  });

  it('allows override and overrides recommendation when clinician provides valid reasoning', async () => {
    const rulesRepo = makeMockRulesRepo();
    const mockTxResult = {
      success: true,
      execution_id: 'exec-777',
      override_id: 'override-333',
      outbox_id: 'outbox-666',
    };
    const supabase = makeMockSupabase(mockIncident, mockTxResult);

    const evidence: ClinicalEvidence = {
      ecgStElevationMm: 2.5,     // Current elevation
      peakEcgStElevationMm: 3.0, // Unsatisfied ST reduction (16.7%)
    };

    const res = await evaluateClinicalSafetyUseCase(
      { supabase, clinicalRulesRepo: rulesRepo },
      { 
        incidentId: 'incident-123', 
        evidence,
        overrideReason: 'El paciente se encuentra asintomatico y con hemodinamia estable.',
        authorizedBy: 'auth-user-99'
      }
    );

    expect(res.success).toBe(true);
    expect(res.isValid).toBe(true); // Superado por criterio medico
    expect(res.recommendation).toBe('allow_closure');
    expect(res.executionId).toBe('exec-777');
    expect(res.overrideId).toBe('override-333');

    // Confirm execution RPC logged override rationale and allow_closure
    expect(supabase.rpc).toHaveBeenCalledWith(
      'log_clinical_rule_evaluation_transaction',
      expect.objectContaining({
        p_recommendation: 'allow_closure',
        p_override_reason: 'El paciente se encuentra asintomatico y con hemodinamia estable.',
        p_authorized_by: 'auth-user-99',
      })
    );

    // Confirm domain events are emitted with overriding recommendation
    expect(mockEmit).toHaveBeenCalledWith('clinical.safety_rule_evaluated', expect.objectContaining({
      recommendation: 'allow_closure',
      isValid: true,
      overrideId: 'override-333',
    }));
  });
});
