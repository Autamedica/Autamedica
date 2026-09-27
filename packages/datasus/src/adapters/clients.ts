import type { DatasusResolvedConfig } from '../config';
import type { RndsDomain, RndsSendResult } from '../types/evidence.types';
import type { RacAtendimentoInput } from '../types/rac.types';
import type { RepmPrescricaoInput } from '../types/repm.types';
import type { RedfmDispensacaoInput, RedfmEstornoInput } from '../types/redfm.types';
import type { ClientAssertionSigner } from './assertion';
import { BaseRndsClient } from './base-rnds.client';
import { CadsusClient } from './cadsus.client';
import type { CadsusClientOptions } from './cadsus.client';
import { buildRacBundle } from '../mappers/rac.mapper';
import { buildRepmMedicationRequest } from '../mappers/repm.mapper';
import { buildRedfmEstorno, buildRedfmMedicationDispense } from '../mappers/redfm.mapper';

export interface DatasusClients {
  cadsus: CadsusClient;
  rac: RacClient;
  repm: RepmClient;
  redfm: RedfmClient;
}

export class RacClient extends BaseRndsClient {
  async sendAtendimento(input: RacAtendimentoInput): Promise<RndsSendResult> {
    return this.sendDocument(buildRacBundle(input), 'rac');
  }
}

export class RepmClient extends BaseRndsClient {
  async sendPrescricao(input: RepmPrescricaoInput): Promise<RndsSendResult> {
    return this.sendDocument(buildRepmMedicationRequest(input), 'repm');
  }
}

export class RedfmClient extends BaseRndsClient {
  async sendDispensacao(input: RedfmDispensacaoInput): Promise<RndsSendResult> {
    return this.sendDocument(buildRedfmMedicationDispense(input), 'redfm');
  }

  async sendEstorno(input: RedfmEstornoInput): Promise<RndsSendResult> {
    return this.sendDocument(buildRedfmEstorno(input), 'redfm');
  }
}

export interface BuildDatasusClientsOptions {
  config: DatasusResolvedConfig;
  fetchImpl?: typeof fetch;
  signer?: ClientAssertionSigner;
  domain?: RndsDomain;
}

export function buildDatasusClients(options: BuildDatasusClientsOptions): DatasusClients {
  const base = {
    config: options.config,
    fetchImpl: options.fetchImpl,
    signer: options.signer,
  };

  const cadsusOptions: CadsusClientOptions = {
    config: options.config,
    fetchImpl: options.fetchImpl,
  };

  return {
    cadsus: new CadsusClient(cadsusOptions),
    rac: new RacClient(base),
    repm: new RepmClient(base),
    redfm: new RedfmClient(base),
  };
}