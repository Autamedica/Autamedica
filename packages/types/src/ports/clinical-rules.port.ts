import { Database } from '../supabase/database.types';

export type ClinicalRule = Database['public']['Tables']['clinical_rules']['Row'];
export type ClinicalRuleVersion = Database['public']['Tables']['clinical_rule_versions']['Row'];
export type ClinicalRuleCondition = Database['public']['Tables']['clinical_rule_conditions']['Row'];
export type ClinicalRequiredObservation = Database['public']['Tables']['clinical_required_observations']['Row'];
export type ClinicalResolutionCriterion = Database['public']['Tables']['clinical_resolution_criteria']['Row'];
export type ClinicalRedFlag = Database['public']['Tables']['clinical_red_flags']['Row'];
export type ClinicalRuleExecution = Database['public']['Tables']['clinical_rule_executions']['Row'];
export type ClinicalRuleOverride = Database['public']['Tables']['clinical_rule_overrides']['Row'];

export interface TroponinMeasurement {
  timestamp: string;
  valueNgMl: number;
}

export interface ClinicalEvidence {
  painScaleVas?: number;         // Pain scale (0-10)
  ecgStElevationMm?: number;     // ST segment elevation (mm)
  peakEcgStElevationMm?: number; // Baseline peak ST segment (mm)
  troponinHistory?: TroponinMeasurement[];
  oxygenSaturationPct?: number;  // SpO2 (%)
  glasgowComaScale?: number;     // GCS (3-15)
  
  // Red flag checklist mapping
  hasThunderclapOnset?: boolean;
  hasNewFocalDeficits?: boolean;
  hasMeningism?: boolean;
  isImmunodeficient?: boolean;
  
  customParameters?: Record<string, string | number | boolean>;
}


export interface IClinicalRulesRepository {
  getRuleBySnomedOrCie10(code: string): Promise<ClinicalRule | null>;
  getActiveVersion(ruleId: string): Promise<ClinicalRuleVersion | null>;
  getConditions(versionId: string): Promise<ClinicalRuleCondition[]>;
  getRequiredObservations(versionId: string): Promise<ClinicalRequiredObservation[]>;
  getResolutionCriteria(versionId: string): Promise<ClinicalResolutionCriterion[]>;
  getRedFlags(versionId: string): Promise<ClinicalRedFlag[]>;
}

export interface IRuleExecutionRepository {
  logExecution(
    execution: Omit<ClinicalRuleExecution, 'id' | 'executed_at'>
  ): Promise<ClinicalRuleExecution>;
  logOverride(
    override: Omit<ClinicalRuleOverride, 'id' | 'overridden_at'>
  ): Promise<ClinicalRuleOverride>;
  getExecutionHistory(patientId: string): Promise<ClinicalRuleExecution[]>;
  getOverrideHistory(patientId: string): Promise<ClinicalRuleOverride[]>;
}
