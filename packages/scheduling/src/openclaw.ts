/**
 * OpenClaw Integration — Envía mensajes vía WhatsApp/Telegram a través de OpenClaw.
 *
 * OpenClaw es un gateway self-hosted que conecta con WhatsApp (vía QR code),
 * Telegram, Signal, etc. Usa la CLI `openclaw message send` para enviar mensajes.
 *
 * @see https://docs.openclaw.ai/cli/message
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface OpenClawConfig {
  /** URL base de OpenClaw (default: http://127.0.0.1:18789) */
  baseUrl: string;
  /** Token de autenticación */
  token: string;
  /** Canal por defecto (whatsapp, telegram, etc) */
  defaultChannel: 'whatsapp' | 'telegram' | 'signal' | 'discord';
  /** Account ID para WhatsApp (default: ecucondor) */
  accountId?: string;
}

export const DEFAULT_OPENCLAW_CONFIG: OpenClawConfig = {
  baseUrl: 'http://127.0.0.1:18789',
  token: '',
  defaultChannel: 'whatsapp',
  accountId: 'autamedica',
};

interface SendMessageOptions {
  /** Número de teléfono del destinatario (E.164 format) */
  to: string;
  /** Mensaje a enviar */
  message: string;
  /** Canal de envío (override del default) */
  channel?: OpenClawConfig['defaultChannel'];
}

interface OpenClawResponse {
  ok: boolean;
  error?: string;
  raw?: string;
}

/**
 * Envía un mensaje a través de OpenClaw CLI.
 *
 * Usa `openclaw message send --channel whatsapp --target <to> --message <msg> --json`
 */
export async function sendMessage(
  config: OpenClawConfig,
  options: SendMessageOptions,
): Promise<OpenClawResponse> {
  const { to, message, channel } = options;
  const ch = channel ?? config.defaultChannel;
  const account = config.accountId ?? 'ecucondor';

  const args = [
    'openclaw', 'message', 'send',
    '--channel', ch,
    '--target', to,
    '--message', message,
    '--account', account,
    '--json',
  ];

  const cmd = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');

  try {
    const { stdout, stderr } = await execAsync(cmd, { timeout: 30_000 });

    if (stderr?.includes('error')) {
      return { ok: false, error: stderr.trim(), raw: stdout };
    }

    try {
      const result = JSON.parse(stdout);
      if (result.error) {
        return { ok: false, error: result.error, raw: stdout };
      }
      return { ok: true, raw: stdout };
    } catch {
      return { ok: true, raw: stdout };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'OpenClaw CLI execution failed',
    };
  }
}

// ==========================================
// Reminder message templates
// ==========================================

export interface ReminderMessageData {
  patientName: string;
  doctorName: string;
  date: string;
  time: string;
  type: string;
  location?: string;
}

/**
 * Genera el mensaje de recordatorio de cita (24h antes).
 */
export function buildReminder24h(data: ReminderMessageData): string {
  const locationLine = data.location
    ? `📍 *Ubicación:* ${data.location}`
    : `💻 *Modalidad:* Telemedicina`;

  return [
    `🏥 *Recordatorio de turno — AutaMedica*`,
    ``,
    `Hola ${data.patientName}, te recordamos que tenés turno mañana:`,
    ``,
    `👨‍⚕️ *Doctor:* ${data.doctorName}`,
    `📅 *Fecha:* ${data.date}`,
    `🕐 *Hora:* ${data.time}`,
    `📋 *Tipo:* ${data.type}`,
    locationLine,
    ``,
    `Respondé:`,
    `✅ *CONFIRMO* — para confirmar asistencia`,
    `❌ *CANCELO* — para cancelar el turno`,
    ``,
    `_Si no respondés, el turno se mantiene agendado._`,
  ].join('\n');
}

/**
 * Genera el mensaje de recordatorio corto (2h antes).
 */
export function buildReminder2h(data: ReminderMessageData): string {
  return [
    `⏰ *Turno en 2 horas*`,
    ``,
    `${data.patientName}, tu turno con Dr. ${data.doctorName} es a las ${data.time}.`,
    data.location
      ? `📍 ${data.location}`
      : `💻 Ingresá a autamedica.com para la videollamada.`,
  ].join('\n');
}

/**
 * Genera mensaje de oferta de waitlist.
 */
export function buildWaitlistOffer(data: {
  patientName: string;
  doctorName: string;
  date: string;
  time: string;
  expiresIn: string;
}): string {
  return [
    `🔔 *Turno disponible — AutaMedica*`,
    ``,
    `Hola ${data.patientName}, se liberó un turno:`,
    ``,
    `👨‍⚕️ Dr. ${data.doctorName}`,
    `📅 ${data.date} a las ${data.time}`,
    ``,
    `⏳ Tenés ${data.expiresIn} para responder.`,
    ``,
    `Respondé *ACEPTO* para reservar el turno.`,
  ].join('\n');
}

/**
 * Parsea la respuesta del paciente a un recordatorio.
 */
export function parsePatientResponse(
  message: string,
): 'confirmed' | 'cancelled' | 'accepted' | null {
  const normalized = message.trim().toLowerCase();

  if (['confirmo', 'si', 'sí', 'ok', 'confirmar', 'confirma'].includes(normalized)) {
    return 'confirmed';
  }

  if (['cancelo', 'cancelar', 'no', 'cancela'].includes(normalized)) {
    return 'cancelled';
  }

  if (['acepto', 'aceptar', 'quiero', 'dale'].includes(normalized)) {
    return 'accepted';
  }

  return null;
}

// ==========================================
// HTTP Webhook Integration (preferred over CLI)
// ==========================================

/**
 * Envía un mensaje vía OpenClaw Gateway HTTP API.
 * Usa el endpoint /hooks/agent para enviar como agente directamente.
 * Más confiable y rápido que la CLI.
 */
export async function sendMessageViaWebhook(
  config: OpenClawConfig,
  options: SendMessageOptions,
): Promise<OpenClawResponse> {
  const { to, message, channel } = options;
  const ch = channel ?? config.defaultChannel;

  const payload = {
    agentId: config.accountId ?? 'autamedica',
    message: `Envía este mensaje exacto al paciente, sin modificar nada:\n\n${message}`,
    deliver: true,
    channel: ch,
    to,
  };

  try {
    const response = await fetch(`${config.baseUrl}/hooks/agent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `HTTP ${response.status}: ${text}` };
    }

    const result = await response.text();
    return { ok: true, raw: result };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'OpenClaw webhook request failed',
    };
  }
}

/**
 * Envía un mensaje intentando primero webhook HTTP, y si falla, CLI.
 */
export async function sendMessageWithFallback(
  config: OpenClawConfig,
  options: SendMessageOptions,
): Promise<OpenClawResponse> {
  // Try webhook first
  const webhookResult = await sendMessageViaWebhook(config, options);
  if (webhookResult.ok) return webhookResult;

  // Fallback to CLI
  return sendMessage(config, options);
}
