/**
 * AnmatSntAdapter — cliente SOAP 1.2 contra el Sistema Nacional de Trazabilidad de ANMAT.
 *
 * Servicio oficial: https://trazabilidad.anmat.gov.ar/services/ws/TrazaMedicamentos
 * Autenticación: WSSE UsernameToken + certificado cliente SSL (mTLS).
 *
 * Métodos usados:
 *   - informarMedicamento    → registra transacción (origen → destino)
 *   - confirmarTransaccion   → receptor confirma haberla recibido
 *   - sendAnularTransaccion  → anula una transacción previa
 *
 * NOTA: el SOAP de ANMAT es viejo y estricto con el orden de namespaces.
 * Construimos el envelope manualmente para no depender de librerías pesadas.
 */

import { createHash } from 'node:crypto';
import type {
  IAnmatSntReporter,
  AnmatInformPayload,
  AnmatInformResult,
} from '../../domain/anmat.ports';
import { logger } from '@autamedica/shared';

export interface AnmatConfig {
  wsdlEndpoint: string;
  username: string;
  password: string;
  cuitDispensador: string;
  // Opcional: PEM del certificado cliente (si el runtime soporta mTLS via fetch dispatcher)
  clientCertPem?: string;
  clientKeyPem?: string;
  requestTimeoutMs?: number;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

function buildInformEnvelope(config: AnmatConfig, payload: AnmatInformPayload): string {
  const header = `
    <soapenv:Header>
      <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
        <wsse:UsernameToken>
          <wsse:Username>${escapeXml(config.username)}</wsse:Username>
          <wsse:Password>${escapeXml(config.password)}</wsse:Password>
        </wsse:UsernameToken>
      </wsse:Security>
    </soapenv:Header>`;

  const body = `
    <soapenv:Body>
      <trz:sendInformarMedicamento xmlns:trz="http://service.traza.servicios.pami.org.ar/">
        <arg0>
          <gtin>${escapeXml(payload.gtin)}</gtin>
          <nro_serie>${escapeXml(payload.serie)}</nro_serie>
          <lote>${escapeXml(payload.lote)}</lote>
          <vencimiento>${escapeXml(payload.vencimiento)}</vencimiento>
          <cuit_origen>${escapeXml(payload.origenCuit)}</cuit_origen>
          <cuit_destino>${escapeXml(payload.destinoCuit)}</cuit_destino>
          <id_evento>${escapeXml(payload.eventoTipo)}</id_evento>
          <f_evento>${escapeXml(payload.fechaEvento)}</f_evento>
          ${payload.prescriptionCuir ? `<n_remito>${escapeXml(payload.prescriptionCuir)}</n_remito>` : ''}
          ${payload.pacienteDocumento ? `<n_documento_paciente>${escapeXml(payload.pacienteDocumento)}</n_documento_paciente>` : ''}
        </arg0>
      </trz:sendInformarMedicamento>
    </soapenv:Body>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
${header}
${body}
</soapenv:Envelope>`;
}

function extractTransactionId(xml: string): string | null {
  const match = xml.match(/<p_ids_transac_asociadas>([^<]+)<\/p_ids_transac_asociadas>/)
    ?? xml.match(/<codigoTransaccion>([^<]+)<\/codigoTransaccion>/)
    ?? xml.match(/<id_transac_asociada>([^<]+)<\/id_transac_asociada>/);
  return match?.[1] ?? null;
}

function extractSoapError(xml: string): string | null {
  const fault = xml.match(/<(?:soapenv:|S:|)Fault>[\s\S]*?<(?:faultstring|reason)[^>]*>([\s\S]*?)<\/(?:faultstring|reason)>/i);
  return fault?.[1]?.trim() ?? null;
}

export class AnmatSntAdapter implements IAnmatSntReporter {
  constructor(private readonly config: AnmatConfig) {
    if (!config.wsdlEndpoint) throw new Error('ANMAT wsdlEndpoint required');
    if (!config.username || !config.password) throw new Error('ANMAT credentials required');
  }

  private async callSoap(envelope: string, soapAction: string): Promise<string> {
    const res = await fetch(this.config.wsdlEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': soapAction,
      },
      body: envelope,
      signal: AbortSignal.timeout(this.config.requestTimeoutMs ?? 30_000),
    });

    const text = await res.text();
    if (!res.ok) throw new Error(`ANMAT HTTP ${res.status}: ${text.slice(0, 300)}`);

    const err = extractSoapError(text);
    if (err) throw new Error(`ANMAT SOAP fault: ${err}`);
    return text;
  }

  async informarMedicamento(payload: AnmatInformPayload): Promise<AnmatInformResult> {
    const envelope = buildInformEnvelope(this.config, payload);
    const hash = createHash('sha256').update(`${payload.gtin}:${payload.serie}:${payload.lote}`).digest('hex').slice(0, 12);
    logger.info(`[AnmatSntAdapter] informarMedicamento gtin=${payload.gtin} serie=${payload.serie} hash=${hash}`);

    const response = await this.callSoap(envelope, 'sendInformarMedicamento');
    const transactionId = extractTransactionId(response);
    if (!transactionId) throw new Error('ANMAT: no transactionId in response');

    return {
      transactionId,
      raw: { response },
    };
  }

  async confirmarTransaccion(transactionId: string): Promise<AnmatInformResult> {
    const body = `<soapenv:Body>
      <trz:sendConfirmarTransaccion xmlns:trz="http://service.traza.servicios.pami.org.ar/">
        <arg0>${escapeXml(transactionId)}</arg0>
      </trz:sendConfirmarTransaccion>
    </soapenv:Body>`;

    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>${escapeXml(this.config.username)}</wsse:Username>
      <wsse:Password>${escapeXml(this.config.password)}</wsse:Password>
    </wsse:UsernameToken>
  </wsse:Security></soapenv:Header>
${body}
</soapenv:Envelope>`;

    const response = await this.callSoap(envelope, 'sendConfirmarTransaccion');
    return { transactionId, raw: { response } };
  }

  async anularTransaccion(transactionId: string, motivo: string): Promise<AnmatInformResult> {
    const body = `<soapenv:Body>
      <trz:sendAnularTransaccion xmlns:trz="http://service.traza.servicios.pami.org.ar/">
        <arg0>${escapeXml(transactionId)}</arg0>
        <arg1>${escapeXml(motivo)}</arg1>
      </trz:sendAnularTransaccion>
    </soapenv:Body>`;

    const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header><wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
    <wsse:UsernameToken>
      <wsse:Username>${escapeXml(this.config.username)}</wsse:Username>
      <wsse:Password>${escapeXml(this.config.password)}</wsse:Password>
    </wsse:UsernameToken>
  </wsse:Security></soapenv:Header>
${body}
</soapenv:Envelope>`;

    const response = await this.callSoap(envelope, 'sendAnularTransaccion');
    return { transactionId, raw: { response } };
  }
}
