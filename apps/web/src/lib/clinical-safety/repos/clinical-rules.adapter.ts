import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Database,
  ClinicalRule,
  ClinicalRuleVersion,
  ClinicalRuleCondition,
  ClinicalRequiredObservation,
  ClinicalResolutionCriterion,
  ClinicalRedFlag,
  ClinicalRuleExecution,
  ClinicalRuleOverride,
  IClinicalRulesRepository,
  IRuleExecutionRepository,
} from '@autamedica/types';
import { logger } from '@autamedica/shared';

type Db = SupabaseClient<Database>;

export function createClinicalRulesAdapter(supabase: Db): IClinicalRulesRepository {
  return {
    async getRuleBySnomedOrCie10(code: string): Promise<ClinicalRule | null> {
      const { data, error } = await supabase
        .from('clinical_rules')
        .select('*')
        .or(`snomed_concept_id.eq.${code},cie10_code.eq.${code}`)
        .maybeSingle();

      if (error) {
        logger.error('[clinicalRulesRepo] getRuleBySnomedOrCie10 failed', error);
        throw error;
      }
      return data;
    },

    async getActiveVersion(ruleId: string): Promise<ClinicalRuleVersion | null> {
      const { data, error } = await supabase
        .from('clinical_rule_versions')
        .select('*')
        .eq('rule_id', ruleId)
        .eq('status', 'active')
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error('[clinicalRulesRepo] getActiveVersion failed', error);
        throw error;
      }
      return data;
    },

    async getConditions(versionId: string): Promise<ClinicalRuleCondition[]> {
      const { data, error } = await supabase
        .from('clinical_rule_conditions')
        .select('*')
        .eq('rule_version_id', versionId);

      if (error) {
        logger.error('[clinicalRulesRepo] getConditions failed', error);
        throw error;
      }
      return data ?? [];
    },

    async getRequiredObservations(versionId: string): Promise<ClinicalRequiredObservation[]> {
      const { data, error } = await supabase
        .from('clinical_required_observations')
        .select('*')
        .eq('rule_version_id', versionId);

      if (error) {
        logger.error('[clinicalRulesRepo] getRequiredObservations failed', error);
        throw error;
      }
      return data ?? [];
    },

    async getResolutionCriteria(versionId: string): Promise<ClinicalResolutionCriterion[]> {
      const { data, error } = await supabase
        .from('clinical_resolution_criteria')
        .select('*')
        .eq('rule_version_id', versionId);

      if (error) {
        logger.error('[clinicalRulesRepo] getResolutionCriteria failed', error);
        throw error;
      }
      return data ?? [];
    },

    async getRedFlags(versionId: string): Promise<ClinicalRedFlag[]> {
      const { data, error } = await supabase
        .from('clinical_red_flags')
        .select('*')
        .eq('rule_version_id', versionId);

      if (error) {
        logger.error('[clinicalRulesRepo] getRedFlags failed', error);
        throw error;
      }
      return data ?? [];
    },
  };
}

export function createRuleExecutionAdapter(supabase: Db): IRuleExecutionRepository {
  return {
    async logExecution(
      execution: Omit<ClinicalRuleExecution, 'id' | 'executed_at'>
    ): Promise<ClinicalRuleExecution> {
      const { data, error } = await supabase
        .from('clinical_rule_executions')
        .insert(execution)
        .select('*')
        .single();

      if (error) {
        logger.error('[ruleExecutionRepo] logExecution failed', error);
        throw error;
      }
      return data;
    },

    async logOverride(
      override: Omit<ClinicalRuleOverride, 'id' | 'overridden_at'>
    ): Promise<ClinicalRuleOverride> {
      const { data, error } = await supabase
        .from('clinical_rule_overrides')
        .insert(override)
        .select('*')
        .single();

      if (error) {
        logger.error('[ruleExecutionRepo] logOverride failed', error);
        throw error;
      }
      return data;
    },

    async getExecutionHistory(patientId: string): Promise<ClinicalRuleExecution[]> {
      const { data, error } = await supabase
        .from('clinical_rule_executions')
        .select('*')
        .eq('patient_id', patientId)
        .order('executed_at', { ascending: false });

      if (error) {
        logger.error('[ruleExecutionRepo] getExecutionHistory failed', error);
        throw error;
      }
      return data ?? [];
    },

    async getOverrideHistory(patientId: string): Promise<ClinicalRuleOverride[]> {
      const { data, error } = await supabase
        .from('clinical_rule_overrides')
        .select('*, clinical_rule_executions!inner(*)')
        .eq('clinical_rule_executions.patient_id', patientId)
        .order('overridden_at', { ascending: false });

      if (error) {
        logger.error('[ruleExecutionRepo] getOverrideHistory failed', error);
        throw error;
      }

      // Format clean array
      return (data ?? []).map((row) => {
        const { clinical_rule_executions, ...overrideData } = row as unknown as {
          clinical_rule_executions: unknown;
        } & ClinicalRuleOverride;
        return overrideData;
      });
    },
  };
}
