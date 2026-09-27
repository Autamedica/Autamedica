export { resolveDatasusConfig } from './config';
export type { DatasusResolvedConfig } from './config';

export { BaseRndsClient, RndsHttpError, RndsOfflineError } from './adapters/base-rnds.client';
export type { BaseRndsClientOptions } from './adapters/base-rnds.client';

export { CadsusClient, buildCadsusPdqEnvelope, parseCadsusPdqResponse } from './adapters/cadsus.client';
export type { CadsusClientOptions } from './adapters/cadsus.client';

export { RacClient, RepmClient, RedfmClient, buildDatasusClients } from './adapters/clients';
export { buildRacBundle } from './mappers/rac.mapper';
export { buildRepmMedicationRequest } from './mappers/repm.mapper';
export { buildRedfmMedicationDispense, buildRedfmEstorno } from './mappers/redfm.mapper';
export { SupabaseRndsEvidenceRepository } from './evidence/rnds-evidence.repo';
export { createMtlsFetch } from './node/mtls';

export type {
  IRndsEvidenceRepository,
  RndsEvidenceRecord,
  RndsDomain,
  RndsDirection,
  RndsEnvironment,
  RndsEventStatus,
  RndsSendResult,
} from './types/evidence.types';

export type {
  ICadsusClient,
  CadsusLookupRequest,
  CadsusLookupResult,
  CadsusLookupSource,
  CadsusMunicipio,
  CadsusPerson,
  CadsusSex,
  CADSUS_REQUIRED_FIELDS,
} from './types/cadsus.types';

export type {
  RacAtendimentoInput,
  RacProblema,
  RacAlergia,
  RacProcedimento,
  RacMedicamento,
  RacProfissional,
  RacIndividuo,
  RacProcedencia,
  RacModalidade,
  RacCarater,
  RacDesfecho,
} from './types/rac.types';

export type {
  RepmPrescricaoInput,
  RepmIndividuo,
  RepmProfissional,
  RepmMedicamento,
  ConselhoTipo,
} from './types/repm.types';

export type {
  RedfmDispensacaoInput,
  RedfmEstornoInput,
  RedfmMedicamento,
  RedfmSituacao,
  RedfmTipoDispensacao,
} from './types/redfm.types';