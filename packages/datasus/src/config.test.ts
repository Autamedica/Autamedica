import { afterEach, describe, expect, it } from 'vitest';
import { resolveDatasusConfig } from './config';
import { RndsOfflineError } from './adapters/base-rnds.client';

const OLD_ENV = process.env;

describe('datasus config', () => {
  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it('defaults to disabled and captures missing required vars', () => {
    delete process.env.DATASUS_ENABLED;
    delete process.env.DATASUS_CNES;
    const config = resolveDatasusConfig();
    expect(config.enabled).toBe(false);
  });

  it('reads runtime env over server env', () => {
    const config = resolveDatasusConfig({
      DATASUS_ENABLED: 'true',
      DATASUS_CNES: '0000000',
      DATASUS_BASE_URL_HOM: 'https://hom.example.gov.br',
      DATASUS_BASE_URL_PROD: 'https://prod.example.gov.br',
      DATASUS_ENVIRONMENT: 'hom',
      DATASUS_INE: '123',
      DATASUS_UF: 'RS',
    });
    expect(config.enabled).toBe(true);
    expect(config.cnes).toBe('0000000');
    expect(config.baseUrl).toBe('https://hom.example.gov.br');
    expect(config.ine).toBe('123');
    expect(config.uf).toBe('RS');
  });

  it('uses production base URL when environment is prod', () => {
    const config = resolveDatasusConfig({
      DATASUS_ENABLED: 'true',
      DATASUS_CNES: '0000000',
      DATASUS_BASE_URL_HOM: 'https://hom.example.gov.br',
      DATASUS_BASE_URL_PROD: 'https://prod.example.gov.br',
      DATASUS_ENVIRONMENT: 'prod',
    });
    expect(config.baseUrl).toBe('https://prod.example.gov.br');
  });

  it('is consumed by the offline guard', async () => {
    const config = resolveDatasusConfig({ DATASUS_ENABLED: 'false' });
    expect(config.enabled).toBe(false);
    await expect(
      (async () => {
        throw new RndsOfflineError();
      })(),
    ).rejects.toThrow('rnds_offline');
  });
});