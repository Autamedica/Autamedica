import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildDatasusClients,
  resolveDatasusConfig,
  SupabaseRndsEvidenceRepository,
} from '@autamedica/datasus';
import type { RacAlergia, RacAtendimentoInput } from '@autamedica/datasus';
import type { RndsEnvironment } from '@autamedica/datasus';
import { logger } from '@autamedica/shared';

export interface RacOrchestrationInput {
  consultationId: string;
  cns?: string | null;
  cpf?: string | null;
  dataHoraAtendimento: string;
  motivos: string[];
  problemas: Array<{ codigo: string; descricao: string }>;
  alergias: Array<{ categoria: string; criticidade: string; agente: string; manifestacao?: string }>;
  medicamentos: Array<{ texto: string; quantidade?: number; apresentacao?: string }>;
  profissional: {
    cpf: string;
    conselhoTipo: 'CRM' | 'COREN' | 'CRF' | 'CRO' | 'CRMV' | 'CREFITO';
    conselhoUf: string;
    conselhoNumero: string;
  };
  runtimeEnv?: Record<string, unknown> | null;
}

export interface RacOrchestrationResult {
  ok: boolean;
  skipped?: boolean;
  rndsIdentifier?: string;
  errorCode?: string;
}

const EMPTY_CNES_MESSAGE = 'RAC requer DATASUS_CNES (establecimiento de la UBS) para registrarse';

/**
 * Registra el atendimiento en RAC (RNDS) cuando se guarda el informe de la
 * consulta. Fail-soft: nunca bloquea el guardado del informe. Garantiza el
 * circuito cerrado: consulta terminada -> Composition RAC -> evidencia.
 */
export async function orchestrateRacRegistration(
  input: RacOrchestrationInput,
  supabase: SupabaseClient,
): Promise<RacOrchestrationResult> {
  const config = resolveDatasusConfig(input.runtimeEnv);
  const environment: RndsEnvironment = config.environment;
  const evidence = new SupabaseRndsEvidenceRepository(supabase);

  if (!config.enabled) {
    await evidence.save({
      domain: 'rac',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.consultationId,
      errorCode: 'datasus_disabled',
      sanitizedPayload: { reason: 'datasus_disabled' },
    });
    return { ok: true, skipped: true, errorCode: 'datasus_disabled' };
  }

  if (!config.cnes) {
    await evidence.save({
      domain: 'rac',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.consultationId,
      errorCode: 'missing_cnes',
      sanitizedPayload: { reason: 'missing_cnes' },
    });
    logger.warn('[rac-orchestrator] ' + EMPTY_CNES_MESSAGE, { consultationId: input.consultationId });
    return { ok: true, skipped: true, errorCode: 'missing_cnes' };
  }

  if (!input.cns && !input.cpf) {
    await evidence.save({
      domain: 'rac',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.consultationId,
      errorCode: 'missing_patient_identifier',
      sanitizedPayload: { reason: 'missing_patient_identifier' },
    });
    return { ok: true, skipped: true, errorCode: 'missing_patient_identifier' };
  }

  const atendimento: RacAtendimentoInput = {
    estabelecimentoCnes: config.cnes,
    ine: config.ine,
    dataHoraAtendimento: input.dataHoraAtendimento,
    grupo: `am-consulta-${input.consultationId}`,
    individuo: { cns: input.cns ?? undefined, cpf: input.cpf ?? undefined },
    profissionais: [input.profissional],
    motivos: input.motivos,
    problemas: input.problemas.map((problema) => ({
      codigo: problema.codigo,
      sistema: 'cid10',
      categoria: 'principal',
      descricao: problema.descricao,
    })),
    alergias: (input.alergias ?? []).map((alergia) => ({
      categoria: alergia.categoria as RacAlergia['categoria'],
      criticidade: alergia.criticidade as RacAlergia['criticidade'],
      agente: alergia.agente,
      manifestacao: alergia.manifestacao,
    })),
    medicamentos: input.medicamentos,
    procedimentos: [],
    procedencia: 'demanda_espontanea',
    modalidade: 'telemedicina',
    carater: 'eletivo',
    desfecho: 'alta_clinica',
  };

  try {
    const { rac } = buildDatasusClients({ config });
    const result = await rac.sendAtendimento(atendimento);

    await evidence.save({
      domain: 'rac',
      direction: 'response',
      environment,
      status: result.status === 'approved' ? 'ok' : 'pending',
      rndsIdentifier: result.rndsIdentifier,
      referenceId: input.consultationId,
      sanitizedPayload: {},
    });

    logger.info('[rac-orchestrator] RAC registered', {
      consultationId: input.consultationId,
      status: result.status,
    });

    return { ok: true, rndsIdentifier: result.rndsIdentifier };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    await evidence.save({
      domain: 'rac',
      direction: 'request',
      environment,
      status: 'failed',
      referenceId: input.consultationId,
      errorCode: 'send_failed',
      sanitizedPayload: { error: code.slice(0, 200) },
    });
    logger.error('[rac-orchestrator] RAC send failed (non-blocking)', error);
    return { ok: true, skipped: true, errorCode: 'send_failed' };
  }
}