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
  dataNascimento?: string; // dd/mm/YYYY
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
    this.config = {
      apiKey: env?.MEMED_API_KEY || 'iJGiB4kjDGOLeDFPWMG3no9VnN7Abpqe3w1jEFm6olkhkZD6oSfSmYCm',
      secretKey: env?.MEMED_SECRET_KEY || 'Xe8M5GvBGCr4FStKfxXKisRo3SfYKI7KrTMkJpCAstzu2yXVN4av5nmL',
      apiUrl: env?.MEMED_API_URL || 'https://integrations.api.memed.com.br/v1',
      scriptUrl: env?.MEMED_SCRIPT_URL || 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js',
    };
  }

  private buildUrl(path: string): string {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const separator = cleanPath.includes('?') ? '&' : '?';
    return `${this.config.apiUrl}${cleanPath}${separator}api-key=${encodeURIComponent(this.config.apiKey)}&secret-key=${encodeURIComponent(this.config.secretKey)}`;
  }

  /**
   * Obtiene o registra el médico en Memed para retornar su data-token
   */
  async getOrCreateDoctorToken(doctor: MemedDoctorData): Promise<MemedTokenResponse> {
    const identifier = doctor.cpf || doctor.externalId || `${doctor.crm}${doctor.uf}`;

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

    // 2. Si no existe, crearlo
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
          sexo: doctor.sexo || 'M',
          data_nascimento: doctor.dataNascimento || '01/01/1980',
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
}

export const memedService = new MemedService();
