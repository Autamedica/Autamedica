import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildDatasusClients,
  resolveDatasusConfig,
  SupabaseRndsEvidenceRepository,
} from '@autamedica/datasus';
import type { RndsEnvironment } from '@autamedica/datasus';
import { logger } from '@autamedica/shared';

export interface RedfmOrchestrationInput {
  dispenseOrderId: string;
  prescriptionId: string;
  medicamento: { nome: string; formaFarmaceutica?: string; quantidade: number; unidade?: string; codigoObm?: string };
  farmaceutico: {
    cpf: string;
    conselhoTipo: 'CRF' | 'CRM' | 'COREN' | 'CRO' | 'CRMV' | 'CREFITO';
    conselhoUf: string;
    conselhoNumero: string;
  };
  runtimeEnv?: Record<string, unknown> | null;
}

export interface RedfmOrchestrationResult {
  ok: boolean;
  skipped?: boolean;
  rndsIdentifier?: string;
  errorCode?: string;
}

/**
 * Registra la dispensa en REDFM (RNDS) tras una dispensa efectiva en el circuito
 * farmacéutico. Fail-soft: nunca bloquea la dispensa. Medicamentos controlados
 * (semáforo amarillo/rojo) quedan fuera del envío electrónico.
 */
export async function orchestrateRedfmRegistration(
  input: RedfmOrchestrationInput,
  supabase: SupabaseClient,
): Promise<RedfmOrchestrationResult> {
  const config = resolveDatasusConfig(input.runtimeEnv);
  const environment: RndsEnvironment = config.environment;
  const evidence = new SupabaseRndsEvidenceRepository(supabase);

  if (!config.enabled) {
    await evidence.save({
      domain: 'redfm',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.dispenseOrderId,
      errorCode: 'datasus_disabled',
      sanitizedPayload: { reason: 'datasus_disabled' },
    });
    return { ok: true, skipped: true, errorCode: 'datasus_disabled' };
  }

  const { data: order } = await supabase
    .from('dispensation_orders')
    .select('clinical_semaphore, medication, patient_id')
    .eq('id', input.dispenseOrderId)
    .maybeSingle();

  if (order?.clinical_semaphore && order.clinical_semaphore !== 'green') {
    await evidence.save({
      domain: 'redfm',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.dispenseOrderId,
      errorCode: 'controlled_substance',
      sanitizedPayload: { reason: 'controlled_substance_excluded' },
    });
    return { ok: true, skipped: true, errorCode: 'controlled_substance' };
  }

  const { data: prescription } = await supabase
    .from('prescriptions')
    .select('cuir, vendor_name')
    .eq('id', input.prescriptionId)
    .maybeSingle();

  if (!prescription?.cuir) {
    await evidence.save({
      domain: 'redfm',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.dispenseOrderId,
      errorCode: 'missing_cuir',
      sanitizedPayload: { reason: 'missing_cuir' },
    });
    return { ok: true, skipped: true, errorCode: 'missing_cuir' };
  }

  const { data: patient } = await supabase
    .from('patients')
    .select('cns, cpf')
    .eq('id', order?.patient_id ?? '')
    .maybeSingle();

  const cns = patient?.cns ?? null;
  const cpf = patient?.cpf ?? null;

  if (!cns && !cpf) {
    await evidence.save({
      domain: 'redfm',
      direction: 'request',
      environment,
      status: 'skipped',
      referenceId: input.dispenseOrderId,
      errorCode: 'missing_patient_identifier',
      sanitizedPayload: { reason: 'missing_patient_identifier' },
    });
    return { ok: true, skipped: true, errorCode: 'missing_patient_identifier' };
  }

  try {
    const { redfm } = buildDatasusClients({ config });
    const result = await redfm.sendDispensacao({
      identificadorRegistroOrigem: `AM-DISP-${input.dispenseOrderId}`,
      identificadorPrescricaoRnds: undefined,
      identificadorPrescricaoOrigem: prescription.cuir,
      estabelecimentoCnes: config.cnes,
      dataDispensacao: new Date().toISOString(),
      individuo: { cns: cns ?? undefined, cpf: cpf ?? undefined },
      farmaceutico: input.farmaceutico,
      medicamento: {
        codigoObm: input.medicamento.codigoObm,
        nomeGenerico: input.medicamento.nome,
        quantidade: input.medicamento.quantidade,
        unidade: input.medicamento.unidade ?? 'und',
      },
      situacao: 'completo',
      tipoDispensacao: 'total',
    });

    await evidence.save({
      domain: 'redfm',
      direction: 'response',
      environment,
      status: result.status === 'approved' ? 'ok' : 'pending',
      rndsIdentifier: result.rndsIdentifier,
      referenceId: input.dispenseOrderId,
      sanitizedPayload: { cuir: prescription.cuir },
    });

    logger.info('[redfm-orchestrator] REDFM dispense registered', {
      dispenseOrderId: input.dispenseOrderId,
      status: result.status,
    });

    return { ok: true, rndsIdentifier: result.rndsIdentifier };
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error);
    await evidence.save({
      domain: 'redfm',
      direction: 'request',
      environment,
      status: 'failed',
      referenceId: input.dispenseOrderId,
      errorCode: 'send_failed',
      sanitizedPayload: { error: code.slice(0, 200) },
    });
    logger.error('[redfm-orchestrator] REDFM send failed (non-blocking)', error);
    return { ok: true, skipped: true, errorCode: 'send_failed' };
  }
}