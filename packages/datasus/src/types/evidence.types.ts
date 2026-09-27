export type RndsEnvironment = 'hom' | 'prod' | 'mock';

export type RndsDomain = 'cadsus' | 'rac' | 'repm' | 'redfm';

export type RndsDirection = 'request' | 'response';

export type RndsEventStatus =
  | 'ok'
  | 'pending'
  | 'failed'
  | 'skipped'
  | 'offline_mock';

export interface RndsEvidenceRecord {
  id: string;
  domain: RndsDomain;
  direction: RndsDirection;
  environment: RndsEnvironment;
  status: RndsEventStatus;
  sanitizedPayload: Record<string, unknown>;
  rndsIdentifier?: string;
  referenceId?: string;
  errorCode?: string;
  createdAt: string;
}

export interface IRndsEvidenceRepository {
  save(
    record: Omit<RndsEvidenceRecord, 'id' | 'createdAt'>,
  ): Promise<void>;
}

export interface RndsSendResult {
  status: 'reported' | 'approved';
  rndsIdentifier?: string;
  raw?: unknown;
}