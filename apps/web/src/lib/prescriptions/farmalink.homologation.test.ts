import { describe, expect, it, vi } from 'vitest';
import { FarmalinkClient, FarmalinkHttpError } from './farmalink.client';
import {
  buildFarmalinkBajaRecetaRequest,
  buildFarmalinkConsultaRecetaRequest,
} from './farmalink.mapper';
import type { FarmalinkClientConfig } from './farmalink.types';

// Mock-only homologation regression suite. NEVER contacts Farmalink over the network.
const config: FarmalinkClientConfig = {
  baseUrl: 'https://test-servicios.farmalink.com.ar',
  tokenPath: '/api/oauth/token/generate',
  recetaBasePath: '/api/recetaElect/v3',
  oauthUsername: 'dummy-test-user',
  oauthPassword: 'dummy-test-password',
  basicUser: 'dummy-test-client',
  basicPassword: 'dummy-test-client-password',
  scope: 'Switch.RecetaElectRest',
  grantType: 'PASSWORD',
};

const reference = {
  idOrganizacion: '100',
  tipoOrganizacion: 'NMD',
  codEntidad: 7100,
  pan: '12345678',
  nroRecElectronica: '0000000000000',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Farmalink homologation regression (mock only)', () => {
  it('queries a TEST reference with Bearer and interprets business rejection separately from HTTP 200', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'dummy-test-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        consultaRecetaElectRs: {
          respuesta: { codigo: '33', descripcion: 'NUMERO DE RECETA INVALIDO' },
        },
      }));
    const client = new FarmalinkClient({ ...config, fetch: fetchMock });
    const request = buildFarmalinkConsultaRecetaRequest(reference);
    const response = await client.consultaReceta(request) as {
      consultaRecetaElectRs: { respuesta: { codigo: string; descripcion: string } };
    };

    expect(response.consultaRecetaElectRs.respuesta.codigo).toBe('33');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://test-servicios.farmalink.com.ar/api/recetaElect/v3/consultaReceta',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer dummy-test-token',
          'content-type': 'application/json',
        }),
        body: JSON.stringify(request),
      }),
    );
  });

  it('forms a bajaReceta request but executes only a mocked call (no real cancellation)', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'dummy-test-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        bajaRecetaElectRs: { respuesta: { codigo: '00', descripcion: 'OK' } },
      }));
    const client = new FarmalinkClient({ ...config, fetch: fetchMock });
    const request = buildFarmalinkBajaRecetaRequest(reference);
    await client.bajaReceta(request);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://test-servicios.farmalink.com.ar/api/recetaElect/v3/bajaReceta',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({ Authorization: 'Bearer dummy-test-token' }),
        body: JSON.stringify(request),
      }),
    );
  });

  it('stops at OAuth failure without calling any prescription endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      error: 'unauthorized_client',
    }, 401));
    const client = new FarmalinkClient({ ...config, fetch: fetchMock });

    await expect(client.consultaReceta(buildFarmalinkConsultaRecetaRequest(reference)))
      .rejects.toMatchObject({ name: 'FarmalinkHttpError', status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/token/generate');
  });

  it('surfaces a Farmalink 403 channel-not-enabled without falsely reporting approval', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'dummy-test-token', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse({
        error: {
          codigo: '403',
          errorInterno: { codigo: '5093', descripcion: 'CANAL TECNOLOGICO NO HABILITADO' },
        },
      }, 403));
    const client = new FarmalinkClient({ ...config, fetch: fetchMock });

    await expect(client.consultaReceta(buildFarmalinkConsultaRecetaRequest(reference)))
      .rejects.toBeInstanceOf(FarmalinkHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not internally retry a timed-out request; result must be reconciled before retrying', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'dummy-test-token', expires_in: 3600 }))
      .mockRejectedValueOnce(Object.assign(new Error('Network timeout'), { name: 'TimeoutError' }));
    const client = new FarmalinkClient({ ...config, fetch: fetchMock });

    await expect(client.consultaReceta(buildFarmalinkConsultaRecetaRequest(reference)))
      .rejects.toMatchObject({ name: 'TimeoutError' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('forbids redirects when exchanging the OAuth credential pair', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      access_token: 'dummy-test-token',
      expires_in: 3600,
    }));
    const client = new FarmalinkClient({ ...config, fetch: fetchMock });
    await client.generateAccessToken();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test-servicios.farmalink.com.ar/api/oauth/token/generate',
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    );
  });
});
