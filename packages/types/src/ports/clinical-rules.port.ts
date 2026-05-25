import { Database } from '../database.types';

export type ClinicalRule = Database['public']['Tables']['clinical_rules']['Row'];
export type ClinicalRuleVersion = Database['public']['Tables']['clinical_rule_versions']['Row'];
export type ClinicalRuleCondition = Database['public']['Tables']['clinical_rule_conditions']['Row'];
export type ClinicalRequiredObservation = Database['public']['Tables']['clinical_required_observations']['Row'];
export type ClinicalResolutionCriterion = Database['public']['Tables']['clinical_resolution_criteria']['Row'];
export type ClinicalRedFlag = Database['public']['Tables']['clinical_red_flags']['Row'];
export type ClinicalRuleExecution = Database['public']['Tables']['clinical_rule_executions']['Row'];
export type ClinicalRuleOverride = Database['public']['Tables']['clinical_rule_overrides']['Row'];

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
