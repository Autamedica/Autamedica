import { logger } from '@autamedica/shared';
import type { DatasusResolvedConfig } from '../config';
import type {
  CadsusLookupRequest,
  CadsusLookupResult,
  CadsusPerson,
  ICadsusClient,
} from '../types/cadsus.types';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Arma el envelope SOAP para una consulta PDQ (PIX/PDQ, PRPA_IN201309UV02).
 * Busca primero por CNS y, si no hay, por CPF.
 */
export function buildCadsusPdqEnvelope(query: CadsusLookupRequest): string {
  const cns = query.cns?.replace(/\D/g, '');
  const cpf = query.cpf?.replace(/\D/g, '');

  const patientByCns = cns
    ? `              <v3:value xsi:type="II" root="2.16.840.1.113883.4.2.12" extension="${xmlEscape(cns)}"/>\n`
    : '';
  const patientByDocument = !cns && cpf
    ? `              <v3:value xsi:type="II" root="2.16.840.1.113883.4.2.12" extension="${xmlEscape(cpf)}" assigningAuthorityName="CPF"/>\n`
    : '';
  const nameParam = query.nome
    ? `            <v3:parameterList>
              <v3:patientName>
                <v3:value xsi:type="PN">${xmlEscape(query.nome)}</v3:value>
              </v3:patientName>
            </v3:parameterList>\n`
    : '';
  const birthParam = query.dataNascimento
    ? `            <v3:parameterList>
              <v3:patientBirthTime>
                <v3:value xsi:type="TS" value="${xmlEscape(query.dataNascimento)}"/>
              </v3:patientBirthTime>
            </v3:parameterList>\n`
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:v3="urn:hl7-org:v3"
               xmlns:sdtc="urn:hl7-org:sdtc">
  <soap:Header/>
  <soap:Body>
    <v3:PRPA_IN201309UV02>
      <v3:controlActProcess>
        <v3:queryByParameter>
          <v3:queryId root="2.16.840.1.113883.4.2.12" extension="1"/>
${patientByCns}${patientByDocument}${nameParam}${birthParam}
        </v3:queryByParameter>
      </v3:controlActProcess>
    </v3:PRPA_IN201309UV02>
  </soap:Body>
</soap:Envelope>`;
}

function extractFirst(pattern: RegExp, xml: string): string | undefined {
  const match = xml.match(pattern);
  return match?.[1]?.trim();
}

function findPersonIdentifier(xml: string, length: number, kind: 'cns' | 'cpf'): string | undefined {
  const valueRe = /<v3:value\b[^>]*?>/g;
  let match: RegExpExecArray | null;
  while ((match = valueRe.exec(xml)) !== null) {
    const tag = match[0];
    const extension = /extension="(\d+)"/.exec(tag)?.[1];
    if (extension?.length !== length) continue;
    const isCpf = /assigningAuthorityName="CPF"/.test(tag);
    if (kind === 'cpf' && isCpf) return extension;
    if (kind === 'cns' && !isCpf) return extension;
  }
  return undefined;
}

/**
 * Parsea la respuesta PDQ (PRPA_IN201310UV02). La estructura HL7v3 de
 * CADSUS puede variar por servicio; este parser cubre los campos normativos
 * y es tolerante a la ausencia (fail-soft con evidencia).
 */
export function parseCadsusPdqResponse(xml: string): CadsusPerson | null {
  const responseXml = xml.match(/<v3:queryResponse[^>]*>([\s\S]*?)(?:<\/v3:queryResponse>)/)?.[1] ?? xml;

  const cns = findPersonIdentifier(responseXml, 15, 'cns');
  if (!cns) {
    logger.warn('[datasus] CADSUS PDQ response without CNS');
    return null;
  }

  const cpf = findPersonIdentifier(responseXml, 11, 'cpf');
  const nome = extractFirst(/<v3:name(?!\s+use="MA")[^>]*>([^<]+)<\/v3:name>/, responseXml) ?? '';
  const nomeMae = extractFirst(/<v3:name\s+use="MA"[^>]*>([^<]+)<\/v3:name>/, responseXml) ?? null;
  const sexo = extractFirst(/<v3:administrativeGenderCode[^>]*code="([MF])"/, responseXml) as 'M' | 'F' | null;
  const nascimento = extractFirst(/<v3:birthTime[^>]*value="([^"]+)"/, responseXml) ?? null;

  return {
    cns,
    cpf,
    nome,
    nomeMae,
    sexo,
    nascimento,
  };
}

export interface CadsusClientOptions {
  config: DatasusResolvedConfig;
  fetchImpl?: typeof fetch;
}

/**
 * Cliente CADSUS (PDQ) con fallback offline por configuracion apagada.
 */
export class CadsusClient implements ICadsusClient {
  private readonly config: DatasusResolvedConfig;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CadsusClientOptions) {
    this.config = options.config;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async lookup(request: CadsusLookupRequest): Promise<CadsusLookupResult> {
    if (!this.config.enabled || this.config.missing.length > 0) {
      logger.warn('[datasus] CADSUS PDQ not configured. Returning offline mock result.');
      return { found: false, reason: 'error', source: 'offline_mock' };
    }

    try {
      const envelope = buildCadsusPdqEnvelope(request);
      const url = `${this.config.baseUrl.replace(/\/$/, '')}${this.config.cadsusPath}`;
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/soap+xml; charset=utf-8',
          'soapaction': 'urn:hl7-org:v3:PRPA_IN201309UV02',
        },
        body: envelope,
      });

      const xml = await response.text();
      if (!response.ok) {
        logger.warn(`[datasus] CADSUS PDQ HTTP ${response.status}`);
        return { found: false, reason: 'error', source: 'cadsus_pdq', raw: xml.slice(0, 500) };
      }

      const person = parseCadsusPdqResponse(xml);
      if (!person) return { found: false, reason: 'not_found', source: 'cadsus_pdq', raw: xml.slice(0, 500) };

      return { found: true, person, source: 'cadsus_pdq', raw: xml.slice(0, 500) };
    } catch (error) {
      logger.error('[datasus] CADSUS PDQ lookup failed', error);
      return { found: false, reason: 'error', source: 'cadsus_pdq' };
    }
  }
}