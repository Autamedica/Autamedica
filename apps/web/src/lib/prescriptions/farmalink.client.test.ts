import { afterEach, describe, expect, it, vi } from 'vitest';
import { primeRuntimeEnv, resetRuntimeEnvCache } from '@/lib/runtime-env';
import {
  FarmalinkClient,
  FarmalinkHttpError,
  extractFarmalinkAltaResult,
  resolveFarmalinkConfig,
} from './farmalink.client';
import type { FarmalinkAltaRecetaRequest, FarmalinkClientConfig } from './farmalink.types';

const config: FarmalinkClientConfig = {
  baseUrl: 'https://test-servicios.farmalink.com.ar',
  tokenPath: '/api/oauth/token/generate',
  recetaBasePath: '/api/recetaElect/v3',
  oauthUsername: 'app-user',
  oauthPassword: 'app-password',
  basicUser: 'basic-user',
  basicPassword: 'basic-password',
  scope: 'Switch.RecetaElectRest',
  grantType: 'PASSWORD',
};

const altaRequest: FarmalinkAltaRecetaRequest = {
  altaRecetaElectRq: {
    infoCabeceraRq: {
      idOrganizacion: '100',
      tipoOrganizacion: 'NMD',
      ipOrigen: '8.8.8.8',
      infoBrowser: '',
    },
    recElectronica: {
      fechaVigenciaDesde: '2026-05-18',
      fechaVigenciaHasta: '2026-06-17',
      tipoTratamiento: 'N',
      afiliado: {
        nombre: 'Maria',
        apellido: 'Gonzalez',
        sexo: 'F',
        fechaNacimiento: '1990-06-14',
        tipoDocumento: 'DN',
        numeroDocumento: 30123456,
        datosOfuscado: 'N',
        credencial: {
          codEntidad: 7100,
          pan: '12345678',
          plan: 'NO POSEE',
        },
      },
      medico: {
        nombre: 'Eduardo',
        apellido: 'Marques',
        sexo: 'M',
        fechaNacimiento: '1980-01-01',
        tipoDocumento: 'DN',
        numeroDocumento: 22333444,
        domicilioAtencion: 'Av. Santa Fe 1500, CABA',
        matricula: {
          tipo: 'MN',
          provincia: 'C',
          numero: '123456',
        },
      },
      detalleRecElectronica: {
        item: [{
          cantidad: 1,
          codProducto: '00123',
          codDroga: '00001',
          textoGenerico: 'AMOXICILINA 500 MG COMPRIMIDOS',
        }],
      },
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('FarmalinkClient', () => {
  afterEach(() => {
    resetRuntimeEnvCache();
    vi.restoreAllMocks();
  });

  it('resolves configuration from Cloudflare runtime env without exposing secrets', () => {
    primeRuntimeEnv({
      FARMALINK_ENABLED: 'true',
      FARMALINK_OAUTH_USERNAME: 'runtime-user',
      FARMALINK_OAUTH_PASSWORD: 'runtime-pass',
      FARMALINK_BASIC_USER: 'basic-user',
      FARMALINK_BASIC_PASSWORD: 'basic-pass',
      FARMALINK_SCOPE: 'Switch.RecetaElectRest',
    });

    expect(resolveFarmalinkConfig()).toMatchObject({
      enabled: true,
      baseUrl: 'https://test-servicios.farmalink.com.ar',
      tokenPath: '/api/oauth/token/generate',
      recetaBasePath: '/api/recetaElect/v3',
      oauthUsername: 'runtime-user',
      scope: 'Switch.RecetaElectRest',
      missing: [],
    });
  });

  it('generates a token and calls altaReceta with Bearer authorization', async () => {
    const fetchMock: any = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        access_token: 'token-123',
        token_type: 'Bearer',
        expires_in: 3600,
      }))
      .mockResolvedValueOnce(jsonResponse({
        altaRecetaElectRs: {
          respuesta: {
            codigo: '00',
            descripcion: 'OK',
            referencia: '150558326083',
          },
          recElectronica: {
            nroRecElectronica: '9600000002762',
            cuir: '',
          },
        },
      }));

    const client = new FarmalinkClient({ ...config, fetch: fetchMock });
    const result = await client.altaReceta(altaRequest);

    expect(result).toMatchObject({
      approved: true,
      responseCode: '00',
      nroRecElectronica: '9600000002762',
      reference: '150558326083',
    });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://test-servicios.farmalink.com.ar/api/oauth/token/generate',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('basic-user:basic-password').toString('base64')}`,
          grant_type: 'PASSWORD',
          username: 'app-user',
          password: 'app-password',
          scope: 'Switch.RecetaElectRest',
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://test-servicios.farmalink.com.ar/api/recetaElect/v3/altaReceta',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token-123',
          'content-type': 'application/json',
        }),
        body: JSON.stringify(altaRequest),
      }),
    );
  });

  it('caches access tokens until they are near expiration', async () => {
    const fetchMock: any = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'token-123', expires_in: 3600 }))
      .mockImplementation(() => Promise.resolve(jsonResponse({
        altaRecetaElectRs: {
          respuesta: { codigo: '00', descripcion: 'OK' },
          recElectronica: { nroRecElectronica: '9600000002762' },
        },
      })));
    const client = new FarmalinkClient({ ...config, fetch: fetchMock });

    await client.altaReceta(altaRequest);
    await client.altaReceta(altaRequest);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/token/generate'))).toHaveLength(1);
  });

  it('throws a typed HTTP error with the parsed response body', async () => {
    const fetchMock: any = vi.fn().mockResolvedValueOnce(jsonResponse({ error: 'bad_credentials' }, 401));
    const client = new FarmalinkClient({ ...config, fetch: fetchMock });

    await expect(client.generateAccessToken()).rejects.toMatchObject({
      name: 'FarmalinkHttpError',
      status: 401,
      body: { error: 'bad_credentials' },
    } satisfies Partial<FarmalinkHttpError>);
  });

  it('marks AltaReceta as approved when Farmalink returns either 00 or 0', () => {
    expect(extractFarmalinkAltaResult({
      altaRecetaElectRs: {
        respuesta: { codigo: '00', descripcion: 'OK' },
        recElectronica: { nroRecElectronica: '123' },
      },
    }).approved).toBe(true);

    expect(extractFarmalinkAltaResult({
      altaRecetaElectRs: {
        respuesta: { codigo: '0', descripcion: 'OK' },
        recElectronica: { nroRecElectronica: '123' },
      },
    }).approved).toBe(true);
  });

  it('marks AltaReceta as rejected when Farmalink does not return approved codes', () => {
    expect(extractFarmalinkAltaResult({
      altaRecetaElectRs: {
        respuesta: {
          codigo: '52',
          descripcion: 'Credencial invalida',
        },
      },
    })).toMatchObject({
      approved: false,
      responseCode: '52',
      responseDescription: 'Credencial invalida',
    });
  });
  it('does not retry altaReceta after a gateway 504', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({access_token:'dummy',expires_in:3600}))
      .mockResolvedValueOnce(jsonResponse({error:'gateway_timeout'},504));
    const client = new FarmalinkClient({...config,fetch:fetchMock});
    await expect(client.altaReceta(altaRequest)).rejects.toMatchObject({status:504});
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('never approves a successful functional code without a recipe number', () => {
    expect(extractFarmalinkAltaResult({altaRecetaElectRs:{respuesta:{codigo:'00'}}}).approved).toBe(false);
  });

});

