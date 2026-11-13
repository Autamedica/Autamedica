import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@autamedica/shared', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { MemedService } from './memed.service';
import { logger } from '@autamedica/shared';

describe('MemedService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.MEMED_API_KEY;
    delete process.env.MEMED_SECRET_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('throws an error if MEMED_API_KEY or MEMED_SECRET_KEY are missing at runtime', async () => {
    const service = new MemedService({});
    const doctorData = {
      externalId: 'doc-123',
      nome: 'Carlos',
      sobrenome: 'Silva',
      cpf: '12345678900',
      crm: '123456',
      uf: 'SP',
    };

    await expect(service.getOrCreateDoctorToken(doctorData)).rejects.toThrow(
      /Missing Memed API key or Secret key in runtime environment/
    );
  });

  it('throws an error if only one key is provided', async () => {
    const service = new MemedService({ MEMED_API_KEY: 'test-api-key' });
    const doctorData = {
      externalId: 'doc-123',
      nome: 'Carlos',
      sobrenome: 'Silva',
      cpf: '12345678900',
      crm: '123456',
      uf: 'SP',
    };

    await expect(service.getOrCreateDoctorToken(doctorData)).rejects.toThrow(
      /Missing Memed API key or Secret key in runtime environment/
    );
  });

  it('proceeds with API call when valid runtime keys are provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          attributes: {
            token: 'valid-memed-token',
            cpf: '12345678900',
            nome: 'Carlos',
            sobrenome: 'Silva',
            crm: '123456',
            uf: 'SP',
          },
        },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new MemedService({
      MEMED_API_KEY: 'mock-key',
      MEMED_SECRET_KEY: 'mock-secret',
    });

    const doctorData = {
      externalId: 'doc-123',
      nome: 'Carlos',
      sobrenome: 'Silva',
      cpf: '12345678900',
      crm: '123456',
      uf: 'SP',
    };

    const result = await service.getOrCreateDoctorToken(doctorData);
    expect(result.token).toBe('valid-memed-token');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('api-key=mock-key');
    expect(fetchMock.mock.calls[0][0]).toContain('secret-key=mock-secret');
  });
  it('rejects an existing Memed token when provider CRM does not match the authenticated doctor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: { attributes: {
          token: 'wrong-doctor-token',
          nome: 'Carlos', sobrenome: 'Silva',
          cpf: '12345678900', crm: '999999', uf: 'SP',
        } },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const service = new MemedService({
      MEMED_API_KEY: 'mock-key', MEMED_SECRET_KEY: 'mock-secret',
    });
    await expect(service.getOrCreateDoctorToken({
      externalId: 'doctor-123', nome: 'Carlos', sobrenome: 'Silva',
      cpf: '12345678900', crm: '123456', uf: 'SP',
    })).rejects.toThrow('memed_provider_doctor_identity_mismatch');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('accepts Memed homologation GET with registry only in attributes.board', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        data: { attributes: {
          token: 'sandbox-demo-token', external_id: 'demo-doctor',
          cpf: '52998224725', crm: null, uf: null,
          board: { board_code: 'CRM', board_number: '90261103', board_state: 'RS' },
        } },
      }),
    }));
    await expect(new MemedService({ MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret' })
      .getOrCreateDoctorToken({
        externalId: 'demo-doctor', nome: 'Medico', sobrenome: 'DEMO',
        cpf: '52998224725', crm: '90261103', uf: 'RS',
      })).resolves.toMatchObject({ token: 'sandbox-demo-token',
        doctor: { crm: '90261103', uf: 'RS' } });
  });

  it.each([
    { change: { board_number: '90261104' }, label: 'wrong CRM' },
    { change: { board_state: 'SP' }, label: 'wrong UF' },
    { change: { board_code: 'CRO' }, label: 'wrong board' },
  ])('rejects mismatched nested CFM board: $label', async ({ change }) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        data: { attributes: {
          token: 'provider-token', external_id: 'demo-doctor', cpf: '52998224725',
          crm: null, uf: null,
          board: { board_code: 'CRM', board_number: '90261103', board_state: 'RS', ...change },
        } },
      }),
    }));
    await expect(new MemedService({ MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret' })
      .getOrCreateDoctorToken({
        externalId: 'demo-doctor', nome: 'Medico', sobrenome: 'DEMO',
        cpf: '52998224725', crm: '90261103', uf: 'RS',
      })).rejects.toThrow('memed_provider_doctor_identity_mismatch');
  });

  it('rejects inconsistent top-level and nested CRM even if nested CRM matches', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({
        data: { attributes: {
          token: 'provider-token', external_id: 'demo-doctor', cpf: '52998224725',
          crm: '999999', uf: 'RS',
          board: { board_code: 'CRM', board_number: '90261103', board_state: 'RS' },
        } },
      }),
    }));
    await expect(new MemedService({ MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret' })
      .getOrCreateDoctorToken({
        externalId: 'demo-doctor', nome: 'Medico', sobrenome: 'DEMO',
        cpf: '52998224725', crm: '90261103', uf: 'RS',
      })).rejects.toThrow('memed_provider_doctor_identity_mismatch');
  });

  it('never registers a prescriber after a provider authentication error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 });
    vi.stubGlobal('fetch', fetchMock);
    const service = new MemedService({
      MEMED_API_KEY: 'bad-key', MEMED_SECRET_KEY: 'bad-secret',
    });
    await expect(service.getOrCreateDoctorToken({
      externalId: 'doctor-123', nome: 'Carlos', sobrenome: 'Silva',
      cpf: '12345678900', crm: '123456', uf: 'SP',
      dataNascimento: '01/01/1980',
    })).rejects.toThrow('memed_doctor_lookup_failed:401');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not invent a date of birth when registering a new medical prescriber', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const service = new MemedService({
      MEMED_API_KEY: 'test-api-key',
      MEMED_SECRET_KEY: 'test-secret-key',
    });
    await expect(service.getOrCreateDoctorToken({
      externalId: 'doctor-123',
      nome: 'Camila',
      sobrenome: 'Silva',
      cpf: '12345678909',
      crm: '123456',
      uf: 'RS',
    })).rejects.toThrow('memed_doctor_birth_date_required');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects prescription IDs with path traversal characters', async () => {
    const service = new MemedService({
      MEMED_API_KEY: 'test-api-key',
      MEMED_SECRET_KEY: 'test-secret-key',
    });
    await expect(service.getIssuedPrescription('../../other', 'doctor-token'))
      .rejects.toThrow('memed_invalid_prescription_id');
  });

  it.each([401, 403, 404, 500])('reports prescription provider status %s without exposing a body', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
    const service = new MemedService({ MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret' });
    await expect(service.getIssuedPrescription('rx-test', 'synthetic-token'))
      .rejects.toThrow(`memed_prescription_verification_failed:${status}`);
  });

  it('sanitizes network errors and prevents redirects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('secret-key=synthetic-secret'));
    vi.stubGlobal('fetch', fetchMock);
    const service = new MemedService({ MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret' });
    await expect(service.getIssuedPrescription('rx-test', 'synthetic-token'))
      .rejects.toThrow('memed_provider_transport_failed');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'error', cache: 'no-store' });
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it.each(['cpf', 'uf', 'external_id'])('rejects provider identity mismatch for %s', async (field) => {
    const attrs = { token: 'synthetic-token', cpf: '12345678900', crm: '123456', uf: 'SP', [field]: 'different' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: { attributes: attrs } }) }));
    const service = new MemedService({ MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret' });
    await expect(service.getOrCreateDoctorToken({ externalId: 'doctor', nome: 'Synthetic', sobrenome: 'Doctor',
      cpf: '12345678900', crm: '123456', uf: 'SP' })).rejects.toThrow('memed_provider_doctor_identity_mismatch');
  });

  it('rejects arbitrary hosts before credentials can be sent', () => {
    expect(() => new MemedService({ MEMED_API_URL: 'https://other.example/v1' }))
      .toThrow('memed_environment_configuration_invalid');
  });


  const syntheticDoctor = {
    externalId: 'doc-test', nome: 'Synthetic', sobrenome: 'Doctor',
    cpf: '12345678900', crm: '123456', uf: 'SP', dataNascimento: '01/01/1980',
  };
  const credentials = { MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret' };

  it.each(['lookup', 'registration'])('sanitizes invalid JSON during %s without logging provider fragments', async (stage) => {
    const invalidResponse = { ok: true, json: async () => {
      throw new SyntaxError('provider-private-fragment in malformed response');
    } };
    const fetchMock = vi.fn();
    if (stage === 'registration') fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });
    fetchMock.mockResolvedValueOnce(invalidResponse);
    vi.stubGlobal('fetch', fetchMock);
    await expect(new MemedService(credentials).getOrCreateDoctorToken(syntheticDoctor))
      .rejects.toThrow('memed_provider_response_invalid');
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain('provider-private-fragment');
    expect(fetchMock).toHaveBeenCalledTimes(stage === 'registration' ? 2 : 1);
  });

  it.each([null, [], {}, { data: [] }, { data: { attributes: [] } }])(
    'rejects invalid provider envelope %j without registering a doctor', async (body) => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => body });
      vi.stubGlobal('fetch', fetchMock);
      await expect(new MemedService(credentials).getOrCreateDoctorToken(syntheticDoctor))
        .rejects.toThrow('memed_provider_response_invalid');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it.each([null, '', '   ', 123, true, {}, []])('rejects invalid doctor token %j', async (token) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      data: { attributes: { ...syntheticDoctor, token } },
    }) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(new MemedService(credentials).getOrCreateDoctorToken(syntheticDoctor))
      .rejects.toThrow('memed_token_missing_in_response');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('validates the registered doctor response using the same identity checks', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: false, status: 404 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({
        data: { attributes: { cpf: syntheticDoctor.cpf, crm: syntheticDoctor.crm,
          uf: syntheticDoctor.uf, token: 'synthetic-token', nome: 'Synthetic', sobrenome: 'Doctor' } },
      }) });
    vi.stubGlobal('fetch', fetchMock);
    const result = await new MemedService(credentials).getOrCreateDoctorToken(syntheticDoctor);
    expect(result).toEqual({ token: 'synthetic-token',
      doctor: { nome: 'Synthetic Doctor', crm: syntheticDoctor.crm, uf: syntheticDoctor.uf } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

});

