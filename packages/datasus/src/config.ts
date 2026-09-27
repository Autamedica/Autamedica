import { getServerEnvOrDefault } from '@autamedica/shared';
import type { RndsEnvironment } from './types/evidence.types';

type RuntimeEnvRecord = Record<string, unknown> | null | undefined;

export interface DatasusResolvedConfig {
  enabled: boolean;
  environment: RndsEnvironment;
  homologBaseUrl: string;
  productionBaseUrl: string;
  baseUrl: string;
  tokenPath: string;
  fhirBasePath: string;
  cadsusPath: string;
  cnes: string;
  ine?: string;
  uf?: string;
  certPath?: string;
  certPassword?: string;
  assertPem?: string;
  clientId?: string;
  missing: string[];
}

export function resolveDatasusConfig(runtimeEnv?: RuntimeEnvRecord): DatasusResolvedConfig {
  const read = (keys: string[], defaultValue?: string): string | undefined => {
    for (const key of keys) {
      const runtimeValue = runtimeEnv?.[key];
      if (typeof runtimeValue === 'string' && runtimeValue.trim()) return runtimeValue.trim();
      const serverValue = getServerEnvOrDefault(key);
      if (typeof serverValue === 'string' && serverValue.trim()) return serverValue.trim();
    }
    return defaultValue;
  };

  const environment = read(['DATASUS_ENVIRONMENT'], 'hom')?.toLowerCase() as RndsEnvironment;
  const homologBaseUrl = read(['DATASUS_BASE_URL_HOM'], 'https://servicoshm.saude.gov.br') ?? '';
  const productionBaseUrl = read(['DATASUS_BASE_URL_PROD'], 'https://servicos.saude.gov.br') ?? '';
  const baseUrl = environment === 'prod' ? productionBaseUrl : homologBaseUrl;

  const cnes = read(['DATASUS_CNES']) ?? '';
  const missing: string[] = [];
  if (['true', '1', 'yes', 'si', 'sí'].includes(
    (read(['DATASUS_ENABLED'], 'false') ?? 'false').toLowerCase(),
  )) {
    if (!homologBaseUrl) missing.push('DATASUS_BASE_URL_HOM');
    if (!productionBaseUrl) missing.push('DATASUS_BASE_URL_PROD');
    if (!cnes) missing.push('DATASUS_CNES');
  }

  return {
    enabled: ['true', '1', 'yes', 'si', 'sí'].includes(
      (read(['DATASUS_ENABLED'], 'false') ?? 'false').toLowerCase(),
    ),
    environment,
    homologBaseUrl,
    productionBaseUrl,
    baseUrl,
    tokenPath: read(['DATASUS_TOKEN_PATH'], '/oauth/token') ?? '/oauth/token',
    fhirBasePath: read(['DATASUS_FHIR_BASE_PATH'], '/fhir/r4') ?? '/fhir/r4',
    cadsusPath: read(['DATASUS_CADSUS_PATH'], '/cadsus/pdq') ?? '/cadsus/pdq',
    cnes,
    ine: read(['DATASUS_INE']),
    uf: read(['DATASUS_UF']),
    certPath: read(['DATASUS_CERT_PATH']),
    certPassword: read(['DATASUS_CERT_PASSWORD']),
    assertPem: read(['DATASUS_ASSERT_PEM']),
    clientId: read(['DATASUS_CLIENT_ID']),
    missing,
  };
}