import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildDatasusClients,
  resolveDatasusConfig,
  SupabaseRndsEvidenceRepository,
} from '@autamedica/datasus';
import type { RndsEnvironment } from '@autamedica/datasus';
import { logger } from '@autamedica/shared';

export interface RepmOrchestrationMedicamento {
  nome: string;
  dosagem?: string;
  formaFarmaceutica?: string;
  quantidade?: number;
  unidade?: string;
  codigoObm?: string;
  codigoCmed?: string;
}

export interface RepmOrchestrationInput {
  prescriptionId: string;
  cuir: string;
  cns?: string | null;
  cpf?: string | null;
  medicamento: RepmOrchestrationMedicamento;
  prescritorCpf: string;
  prescritorConselhoTipo: 'CRM' | 'COREN' | 'CRF' | 'CRO' | 'CRMV';
  prescritorConselhoUf: string;
  prescritorConselhoNumero: string;
  dataPrescricao: string;
  validadeDias: number;
}

export interface RepmOrchestrationResult {
  ok: boolean;
  skipped?: boolean;
  rndsIdentifier?: string;
  errorCode?: string;
}

interface RepmOrchestratorOptions {
  supabase: SupabaseClient;
  enable?: boolean;
}

/**
 * Registra una prescricao en REPM (RNDS) tras la emision del CUIR.
 * Fail-soft: nunca bloquea la emision de la receta. Si DATASUS no esta
 * configurado, guarda evidencia 'skipped' y sigue.
 */
export async function orchestrateRepmRegistration(
  input: RepmOrchestrationInput,
  options: RepmOrchestratorOptions,
): Promise<RepmOrchestrationResult> {
  const config = resolveDatasusConfig(options.enable !== undefined ? { DATASUS_ENABLED: String(options.enable) } : undefined);
  const environment: RndsEnvironment = config.environment;
  const evidence = new SupabaseRndsEvidenceRepository(options.supabase);

  const loggedValues = {
    prescriptionId: input.prescriptionId,
    cuir: input.cuir,
    medicamento: input.medicamento.nome,
  };

  if (!config.enabled) {
    await evidence.save({
      domain: 'repm',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.prescriptionId,
      errorCode: 'datasus_disabled',
      sanitizedPayload: { cuir: input.cuir, reason: 'datasus_disabled' },
    });
    return { ok: true, skipped: true, errorCode: 'datasus_disabled' };
  }

  if (!config.cnes) {
    await evidence.save({
      domain: 'repm',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.prescriptionId,
      errorCode: 'missing_cnes',
      sanitizedPayload: { cuir: input.cuir, reason: 'missing_cnes' },
    });
    return { ok: true, skipped: true, errorCode: 'missing_cnes' };
  }

  if (!input.cns && !input.cpf) {
    await evidence.save({
      domain: 'repm',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.prescriptionId,
      errorCode: 'missing_patient_identifier',
      sanitizedPayload: { cuir: input.cuir, reason: 'missing_patient_identifier' },
    });
    return { ok: true, skipped: true, errorCode: 'missing_patient_identifier' };
  }

  try {
    const { repm } = buildDatasusClients({ config });
    const result = await repm.sendPrescricao({
      identificadorRegistroOrigem: `AM-RCTA-${input.cuir}`,
      estabelecimentoCnes: config.cnes,
      ine: config.ine,
      uf: config.uf,
      dataPrescricao: input.dataPrescricao,
      validadeDias: input.validadeDias,
      individuo: { cns: input.cns ?? input.cpf!, cpf: input.cpf ?? undefined },
      prescritor: {
        cpf: input.prescritorCpf,
        conselhoTipo: input.prescritorConselhoTipo,
        conselhoUf: input.prescritorConselhoUf,
        conselhoNumero: input.prescritorConselhoNumero,
      },
      medicamento: {
        codigoObm: input.medicamento.codigoObm,
        codigoCmed: input.medicamento.codigoCmed,
        nomeGenerico: input.medicamento.nome,
        dosagem: input.medicamento.dosagem,
        formaFarmaceutica: input.medicamento.formaFarmaceutica ?? 'Uso oral',
        quantidade: input.medicamento.quantidade,
        unidade: input.medicamento.unidade ?? 'und',
      },
    });

    await evidence.save({
      domain: 'repm',
      direction: 'response',
      environment,
      status: result.status === 'approved' ? 'ok' : 'pending',
      rndsIdentifier: result.rndsIdentifier,
      referenceId: input.prescriptionId,
      sanitizedPayload: { cuir: input.cuir },
    });

    await options.supabase.from('prescription_audit_events').insert({
      prescription_id: input.prescriptionId,
      event_type: 'ACT_REPM_REGISTRATION',
      metadata: {
        cuir: input.cuir,
        rnds_identifier: result.rndsIdentifier,
        status: result.status,
      },
    }).then(() => undefined, (error) => {
      logger.warn('[repm-orchestrator] audit event failed', error);
    });

    logger.info('[repm-orchestrator] REPM registered', loggedValues);
    return { ok: true, rndsIdentifier: result.rndsIdentifier };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    await evidence.save({
      domain: 'repm',
      direction: 'request',
      environment,
      status: 'failed',
      referenceId: input.prescriptionId,
      errorCode: 'send_failed',
      sanitizedPayload: { cuir: input.cuir, error: code.slice(0, 200) },
    });
    logger.error('[repm-orchestrator] REPM send failed (non-blocking)', error);
    return { ok: true, skipped: true, errorCode: 'send_failed' };
  }
}