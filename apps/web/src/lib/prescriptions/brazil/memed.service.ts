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

function assertMemedDoctorMatch(attrs: Record<string, unknown>, doctor: MemedDoctorData): void {
  // A lookup by CPF can return another account's access token. Never accept
  // that token until Memed's identity matches the authenticated CFM doctor.
  const digits = (value: unknown): string => String(value ?? '').replace(/\D/g, '');
  const cpf = digits(attrs.cpf);
  if (attrs.external_id !== undefined && attrs.external_id !== doctor.externalId) {
    throw new Error('memed_provider_doctor_identity_mismatch');
  }
  const crm = digits(attrs.crm);
  const uf = String(attrs.uf ?? '').trim().toUpperCase();
  if (cpf !== digits(doctor.cpf) || crm !== digits(doctor.crm) || uf !== doctor.uf.toUpperCase()) {
    throw new Error('memed_provider_doctor_identity_mismatch');
  }
}

export class MemedService {
  private config: MemedConfig;

  constructor(env?: Record<string, string | undefined>) {
    const apiKey = env?.MEMED_API_KEY ?? '';
    const secretKey = env?.MEMED_SECRET_KEY ?? '';
    const apiUrl = env?.MEMED_API_URL || 'https://api.memed.com.br/v1';
    const scriptUrl = env?.MEMED_SCRIPT_URL || 'https://partners.memed.com.br/integration.js';
    const allowedPair = (apiUrl === 'https://api.memed.com.br/v1'
      && scriptUrl === 'https://partners.memed.com.br/integration.js')
      || (apiUrl === 'https://integrations.api.memed.com.br/v1'
      && scriptUrl === 'https://integrations.memed.com.br/modulos/plataforma.sinapse-prescricao/build/sinapse-prescricao.min.js');
    if (!allowedPair) throw new Error('memed_environment_configuration_invalid');

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

  private async request(url: string, options: RequestInit): Promise<Response> {
    try {
      return await fetch(url, { ...options, redirect: 'error', cache: 'no-store',
        referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(8000) });
    } catch {
      // Native fetch errors can include credential-bearing URLs. Never rethrow them.
      throw new Error('memed_provider_transport_failed');
    }
  }

  /**
   * Obtiene o registra el médico en Memed para retornar su data-token
   */
  async getOrCreateDoctorToken(doctor: MemedDoctorData): Promise<MemedTokenResponse> {
    this.ensureCredentials();
    const identifier = doctor.cpf || doctor.externalId || `${doctor.crm}${doctor.uf}`;

    // 1. Intentar consultar si el usuario ya existe en Memed
    try {
      const getUrl = this.buildUrl(`/sinapse-prescricao/usuarios/${encodeURIComponent(identifier)}`);
      const getRes = await this.request(getUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/vnd.api+json',
          'Content-Type': 'application/json',
        },
      });

      if (getRes.ok) {
        const json = await getRes.json();
        const attrs = json.data?.attributes;
        if (!attrs?.token) throw new Error('memed_token_missing_in_response');
        assertMemedDoctorMatch(attrs, doctor);
        return {
          token: attrs.token,
          doctor: {
            nome: `${attrs.nome || ''} ${attrs.sobrenome || ''}`.trim(),
            crm: attrs.crm || doctor.crm,
            uf: attrs.uf || doctor.uf,
          },
        };
      }
      if (getRes.status !== 404) {
        throw new Error(`memed_doctor_lookup_failed:${getRes.status}`);
      }
    } catch (err) {
      // Never register a new doctor after authentication or upstream/network errors.
      logger.warn('[MemedService] Doctor lookup failed; registration blocked', {
        message: err instanceof Error ? err.message : 'unknown',
      });
      throw err;
    }

    // Registration requires the real date of birth. Never invent medical identity fields.
    if (!doctor.dataNascimento || !/^\d{2}\/\d{2}\/\d{4}$/.test(doctor.dataNascimento)) {
      throw new Error('memed_doctor_birth_date_required');
    }
    if (!/^\d{11}$/.test(doctor.cpf.replace(/\D/g, ''))) {
      throw new Error('memed_doctor_cpf_required');
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
          ...(doctor.sexo ? { sexo: doctor.sexo } : {}),
          data_nascimento: doctor.dataNascimento,
        },
      },
    };

    const postRes = await this.request(postUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!postRes.ok) {
      // Do not log or return upstream response bodies: they may contain medical PII.
      logger.error('[MemedService] Doctor registration failed', { status: postRes.status });
      throw new Error(`memed_registration_failed:${postRes.status}`);
    }

    const postJson = await postRes.json();
    const createdAttrs = postJson.data?.attributes;
    if (!createdAttrs?.token) {
      throw new Error('memed_token_missing_in_response');
    }
    assertMemedDoctorMatch(createdAttrs, doctor);

    return {
      token: createdAttrs.token,
      doctor: {
        nome: `${createdAttrs.nome || ''} ${createdAttrs.sobrenome || ''}`.trim(),
        crm: createdAttrs.crm || doctor.crm,
        uf: createdAttrs.uf || doctor.uf,
      },
    };
  }

  /**
   * Server-side verification of an issued prescription. The event from the browser
   * is never sufficient evidence of a valid prescription.
   */
  async getIssuedPrescription(id: string, doctorToken: string): Promise<Record<string, unknown>> {
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id)) throw new Error('memed_invalid_prescription_id');
    if (!doctorToken) throw new Error('memed_missing_doctor_token');
    // Memed's structured-prescription endpoint requires the doctor's Bearer token.
    // Never append the doctor token or partner keys to a loggable URL.
    const apiBase = this.config.apiUrl.replace(/\/$/, '');
    const url = `${apiBase}/prescricoes/${encodeURIComponent(id)}?structuredDocuments=true`;
    const response = await this.request(url, {
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${doctorToken}`,
      },
    });
    if (!response.ok) {
      throw new Error(`memed_prescription_verification_failed:${response.status}`);
    }
    return await response.json() as Record<string, unknown>;
  }

  getScriptUrl(): string {
    return this.config.scriptUrl;
  }
}

export const memedService = new MemedService();

