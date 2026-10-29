import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@autamedica/shared', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { MemedService } from './memed.service';

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

  it('refuses to invent the date of birth when Memed needs to register a new doctor', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);
    const service = new MemedService({
      MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret',
    });
    await expect(service.getOrCreateDoctorToken({
      externalId: 'a-real-doctor-id', nome: 'Ana', sobrenome: 'Silva',
      cpf: '12345678900', crm: '123456', uf: 'RS',
    })).rejects.toThrow('memed_doctor_birth_date_required');
    // One GET is permitted; a fake POST must never be sent.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects placeholder doctor identity before calling Memed', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const service = new MemedService({
      MEMED_API_KEY: 'test-key', MEMED_SECRET_KEY: 'test-secret',
    });
    await expect(service.getOrCreateDoctorToken({
      externalId: 'doctor', nome: 'Ana', sobrenome: 'Silva',
      cpf: '00000000000', crm: '123456', uf: 'RS',
    })).rejects.toThrow('memed_doctor_cpf_required');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
