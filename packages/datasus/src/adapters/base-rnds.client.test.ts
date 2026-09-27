import { describe, expect, it, vi } from 'vitest';
import { BaseRndsClient, RndsOfflineError } from '../adapters/base-rnds.client';
import { resolveDatasusConfig } from '../config';
import { signHmacAssertion } from '../adapters/assertion';

function enabledConfig() {
  return resolveDatasusConfig({
    DATASUS_ENABLED: 'true',
    DATASUS_ENVIRONMENT: 'hom',
    DATASUS_BASE_URL_HOM: 'https://hom.example.gov.br',
    DATASUS_BASE_URL_PROD: 'https://prod.example.gov.br',
    DATASUS_CNES: '2207777',
  });
}

describe('base-rnds.client', () => {
  it('exchanges assertion for token and posts a FHIR document', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const bodyStr = init?.body ? String(init.body) : '';
      if (url.includes('/oauth/token')) {
        return new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 600 }), { status: 200 });
      }
      if (url.includes('/fhir/r4/MedicationRequest')) {
        expect(JSON.stringify(init?.headers)).toContain('Bearer tok-1');
        return new Response(JSON.stringify({ resourceType: 'MedicationRequest', id: 'rnds-req-1' }), { status: 201 });
      }
      void bodyStr;
      return new Response('{}', { status: 404 });
    });

    const client = new BaseRndsClient({
      config: enabledConfig(),
      fetchImpl: fetchMock as unknown as typeof fetch,
      signer: signHmacAssertion('secret'),
    });

    const result = await client.sendDocument({ resourceType: 'MedicationRequest' }, 'repm');
    expect(result.rndsIdentifier).toBe('rnds-req-1');
    expect(fetchMock).toHaveBeenCalled();
  });

  it('throws RndsOfflineError when disabled', async () => {
    const client = new BaseRndsClient({ config: resolveDatasusConfig(), fetchImpl: fetch });
    await expect(client.sendDocument({ resourceType: 'Bundle' }, 'rac')).rejects.toThrow(RndsOfflineError);
  });

  it('throws RndsOfflineError when signer is missing', async () => {
    const client = new BaseRndsClient({ config: enabledConfig(), fetchImpl: fetch });
    await expect(client.sendDocument({ resourceType: 'Bundle' }, 'rac')).rejects.toThrow('missing client assertion signer');
  });
});