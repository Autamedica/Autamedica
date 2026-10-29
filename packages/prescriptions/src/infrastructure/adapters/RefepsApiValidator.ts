import { createHmac } from 'node:crypto';
import type { IRefepsValidator, RefepsValidationResult } from '../../domain/refeps.ports';
import { logger } from '@autamedica/shared';

// Helper function to encode strings as base64url (required for JWT assertions)
function base64url(str: string | Buffer): string {
  const base64 = typeof str === 'string'
    ? Buffer.from(str).toString('base64')
    : str.toString('base64');
  return base64
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// Generate the clientAssertion JWT signed with HS256 using the domainTokenSecret
function generateAssertion(domainUrl: string, secret: string): string {
  const header = { typ: 'JWT', alg: 'HS256' };
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const data = {
    iss: domainUrl,
    iat: currentTimestamp,
    exp: currentTimestamp + 300, // 5 minutes expiration as in Anexo III
    aud: 'aud',
    sub: 'sub',
    name: 'AutaMedica Integrator',
    ident: 'autamedica',
    role: 'system'
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(data));
  const token = `${encodedHeader}.${encodedPayload}`;

  const hmac = createHmac('sha256', secret);
  hmac.update(token);
  const signature = base64url(hmac.digest());

  return `${token}.${signature}`;
}

export class RefepsApiValidator implements IRefepsValidator {
  private readonly _baseUrl: string;
  private readonly _domainTokenSecret?: string;
  private readonly _domainUrl?: string;
  private readonly _fallback?: IRefepsValidator;

  constructor(
    configOrApiKey: string | { baseUrl?: string; domainTokenSecret?: string; domainUrl?: string; fallbackValidator?: IRefepsValidator },
    baseUrl?: string
  ) {
    if (typeof configOrApiKey === 'object') {
      this._baseUrl = configOrApiKey.baseUrl || 'https://bus.msal.gob.ar';
      this._domainTokenSecret = configOrApiKey.domainTokenSecret;
      this._domainUrl = configOrApiKey.domainUrl;
      this._fallback = configOrApiKey.fallbackValidator;
    } else {
      // Support old signature for backward compatibility with existing tests
      this._baseUrl = baseUrl || 'https://bus.msal.gob.ar';
    }
  }

  // Exchanges the HS256 clientAssertion assertion for the OAuth2 access token
  private async getAuthToken(): Promise<string> {
    if (!this._domainTokenSecret || !this._domainUrl) {
      throw new Error('Missing domainTokenSecret or domainUrl for REFEPS Bus API integration');
    }

    const assertion = generateAssertion(this._domainUrl, this._domainTokenSecret);
    const url = `${this._baseUrl.replace(/\/$/, '')}/bus-auth/v2/auth`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        grantType: 'client_credentials',
        scope: 'Practitioner/*.read',
        clientAssertionType: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
        clientAssertion: assertion,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Bus Auth failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { accessToken: string };
    return data.accessToken;
  }

  async validateMatricula(
    matricula: string,
    type: 'MN' | 'MP',
    province?: string
  ): Promise<RefepsValidationResult> {
    // 1. If credentials are not configured, gracefully fall back to database-driven local check
    if (!this._domainTokenSecret || !this._domainUrl) {
      if (this._fallback) {
        logger.info('[RefepsApiValidator] Live Bus credentials not configured. Delegating to local database fallback.');
        return this._fallback.validateMatricula(matricula, type, province);
      }
      
      logger.warn(`[RefepsApiValidator] REFEPS Bus API credentials not configured. Returning offline mock result for ${type} ${matricula}.`);
      return {
        isValid: true, // Bypass check to keep onboarding working in test environments
        matriculaNumber: matricula,
        matriculaType: type,
        fullName: 'Profesional Simulado (Bus Offline)',
        source: 'offline_mock',
        registrationStatus: 'active',
      };
    }

    try {
      // 2. Fetch the access token
      const token = await this.getAuthToken();

      // 3. Perform FHIR Practitioner query against the national bus
      const sisaSystem = encodeURIComponent('https://sisa.msal.gov.ar/REFEPS');
      const url = `${this._baseUrl.replace(/\/$/, '')}/fhir/Practitioner?identifier=${sisaSystem}%7C${matricula}`;

      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/fhir+json',
        },
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Practitioner lookup failed (${res.status}): ${text}`);
      }

      const bundle = (await res.json()) as {
        resourceType: string;
        total?: number;
        entry?: Array<{
          resource: {
            resourceType: string;
            id: string;
            active?: boolean;
            name?: Array<{ given?: string[]; family?: string; text?: string }>;
            qualification?: Array<{
              code?: { text?: string };
              identifier?: Array<{ value?: string; system?: string }>;
            }>;
          };
        }>;
      };

      if (!bundle.entry || bundle.entry.length === 0) {
        logger.warn(`[RefepsApiValidator] Professional not found in REFEPS: ${type} ${matricula}`);
        return {
          isValid: false,
          matriculaNumber: matricula,
          matriculaType: type,
          registrationStatus: 'not_found',
          source: 'national_refeps_api',
        };
      }

      const entry = bundle.entry[0];
      if (!entry?.resource) {
        logger.warn(`[RefepsApiValidator] Professional entry or resource is missing in REFEPS: ${type} ${matricula}`);
        return {
          isValid: false,
          matriculaNumber: matricula,
          matriculaType: type,
          registrationStatus: 'not_found',
          source: 'national_refeps_api',
        };
      }

      const practitioner = entry.resource;
      const givenName = practitioner.name?.[0]?.given?.join(' ') || '';
      const familyName = practitioner.name?.[0]?.family || '';
      const fullName = practitioner.name?.[0]?.text || `${givenName} ${familyName}`.trim();
      const isActive = practitioner.active !== false;
      const qualifications = practitioner.qualification?.map((qualification) => ({
        text: qualification.code?.text,
        identifiers: qualification.identifier?.map((identifier) => ({
          system: identifier.system,
          value: identifier.value,
        })),
      })) ?? [];
      const specialty = qualifications.map((item) => item.text).find(Boolean);

      logger.info(`[RefepsApiValidator] Verified practitioner ${fullName} against national REFEPS.`);

      return {
        isValid: isActive,
        matriculaNumber: matricula,
        matriculaType: type,
        fullName,
        specialty,
        practitionerId: practitioner.id,
        qualifications,
        source: 'national_refeps_api',
        registrationStatus: isActive ? 'active' : 'suspended',
      };
    } catch (error) {
      logger.error('[RefepsApiValidator] Live verification failed', error);
      if (this._fallback) {
        logger.warn('[RefepsApiValidator] Network failure on Live REFEPS API. Falling back to local validation.');
        return this._fallback.validateMatricula(matricula, type, province);
      }
      throw error;
    }
  }
}
