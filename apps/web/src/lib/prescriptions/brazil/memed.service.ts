import { logger } from '@autamedica/shared';

export interface MemedConfig {
  apiKey: string;
  secretKey: string;
  apiUrl: string;
  scriptUrl: string;
}

export interface MemedDoctorData {
  externalId: string;
  nome: string;
  sobrenome: string;
  cpf: string;
  crm: string;
  uf: string;
  email?: string;
  telefone?: string;
  sexo?: 'M' | 'F';
  dataNascimento?: string; // dd/mm/YYYY (mandatory when creating a Memed account)
}

export interface MemedTokenResponse {
  token: string;
  doctor: {
    nome: string;
    crm: string;
    uf: string;
  };
}

export class MemedService {
  private config: MemedConfig;

  constructor(env?: Record<string, string | undefined>) {
    // eslint-disable-next-line no-restricted-properties
    const _processEnv = typeof process !== 'undefined' ? process.env : {};
    const apiKey = env?.MEMED_API_KEY ?? _processEnv?.MEMED_API_KEY ?? '';
    const secretKey = env?.MEMED_SECRET_KEY ?? _processEnv?.MEMED_SECRET_KEY ?? '';
    const apiUrl = (env?.MEMED_API_URL ?? _processEnv?.MEMED_API_URL) || 'https://integrations.api.memed.com.br/v1';
    const scriptUrl = (env?.MEMED_SCRIPT_URL ?? _processEnv?.MEMED_SCRIPT_URL) || 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js';

    this.config = {
      apiKey,
      secretKey,
      apiUrl,
      scriptUrl,
    };
  }

  private ensureCredentials(): void {
    if (!this.config.apiKey || !this.config.secretKey) {
      throw new Error('Missing Memed API key or Secret key in runtime environment (MEMED_API_KEY / MEMED_SECRET_KEY)');
    }
  }

  private buildUrl(path: string): string {
    this.ensureCredentials();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const separator = cleanPath.includes('?') ? '&' : '?';
    return `${this.config.apiUrl}${cleanPath}${separator}api-key=${encodeURIComponent(this.config.apiKey)}&secret-key=${encodeURIComponent(this.config.secretKey)}`;
  }

  /**
   * Obtiene o registra el médico en Memed para retornar su data-token
   */
  async getOrCreateDoctorToken(doctor: MemedDoctorData): Promise<MemedTokenResponse> {
    this.ensureCredentials();
    const cpf = doctor.cpf.replace(/\D/g, '');
    if (!/^\d{11}$/.test(cpf) || cpf === '00000000000') throw new Error('memed_doctor_cpf_required');
    if (!/^[A-Z]{2}$/.test(doctor.uf)) throw new Error('memed_doctor_uf_required');
    if (!/^\d+$/.test(doctor.crm.replace(/\D/g, ''))) throw new Error('memed_doctor_crm_required');
    const identifier = doctor.externalId || cpf;

    // 1. Intentar consultar si el usuario ya existe en Memed
    try {
      const getUrl = this.buildUrl(`/sinapse-prescricao/usuarios/${encodeURIComponent(identifier)}`);
      const getRes = await fetch(getUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.api+json',
          'Content-Type': 'application/json',
        },
      });

      if (getRes.ok) {
        const json = await getRes.json();
        const attrs = json.data?.attributes;
        if (attrs?.token) {
          return {
            token: attrs.token,
            doctor: {
              nome: `${attrs.nome || ''} ${attrs.sobrenome || ''}`.trim(),
              crm: attrs.crm || doctor.crm,
              uf: attrs.uf || doctor.uf,
            },
          };
        }
      }
    } catch (err) {
      logger.warn('[MemedService] Error consultando usuario existente, intentando registro', { err });
    }

    // 2. New registration must not invent regulatory identity attributes.
    if (!doctor.dataNascimento || !/^\d{2}\/\d{2}\/\d{4}$/.test(doctor.dataNascimento)) {
      throw new Error('memed_doctor_birth_date_required');
    }
    const postUrl = this.buildUrl('/sinapse-prescricao/usuarios');
    const payload = {
      data: {
        type: 'usuarios',
        attributes: {
          external_id: doctor.externalId,
          nome: doctor.nome,
          sobrenome: doctor.sobrenome || doctor.nome,
          cpf: doctor.cpf.replace(/\D/g, ''),
          board: {
            board_code: 'CRM',
            board_number: doctor.crm.replace(/\D/g, ''),
            board_state: doctor.uf.toUpperCase(),
          },
          email: doctor.email,
          telefone: doctor.telefone ? doctor.telefone.replace(/\D/g, '') : undefined,
          ...(doctor.sexo ? { sexo: doctor.sexo } : {}),
          data_nascimento: doctor.dataNascimento,
        },
      },
    };

    const postRes = await fetch(postUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!postRes.ok) {
      const errorText = await postRes.text();
      logger.error('[MemedService] Error registrando médico en Memed', { status: postRes.status, body: errorText });
      throw new Error(`memed_registration_failed: ${postRes.status} ${errorText}`);
    }

    const postJson = await postRes.json();
    const createdAttrs = postJson.data?.attributes;
    if (!createdAttrs?.token) {
      throw new Error('memed_token_missing_in_response');
    }

    return {
      token: createdAttrs.token,
      doctor: {
        nome: `${createdAttrs.nome || ''} ${createdAttrs.sobrenome || ''}`.trim(),
        crm: createdAttrs.crm || doctor.crm,
        uf: createdAttrs.uf || doctor.uf,
      },
    };
  }

  getScriptUrl(): string {
    return this.config.scriptUrl;
  }

  getApiUrl(): string {
    return this.config.apiUrl;
  }

  /** Retrieve the Memed prescription over an authenticated server-to-server connection. */
  async getPrescription(doctorToken: string, id: string): Promise<unknown> {
    this.ensureCredentials();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('memed_invalid_prescription_id');
    const url = `${this.config.apiUrl}/prescricoes/${encodeURIComponent(id)}?structuredDocuments=true`;
    const response = await fetch(url, { headers: { Accept: 'application/vnd.api+json', Authorization: `Bearer ${doctorToken}` } });
    if (!response.ok) throw new Error(`memed_prescription_lookup_failed:${response.status}`);
    return response.json();
  }

  async getDigitalPrescriptionLink(doctorToken: string, id: string): Promise<unknown> {
    this.ensureCredentials();
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('memed_invalid_prescription_id');
    const url = `${this.config.apiUrl}/prescricoes/${encodeURIComponent(id)}/get-digital-prescription-link?token=${encodeURIComponent(doctorToken)}`;
    const response = await fetch(url, { headers: { Accept: 'application/vnd.api+json' } });
    if (!response.ok) throw new Error(`memed_prescription_link_failed:${response.status}`);
    return response.json();
  }
}

export const memedService = new MemedService();
