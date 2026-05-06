/**
 * OpenClaw Integration — Envía mensajes vía WhatsApp/Telegram a través de OpenClaw.
 *
 * OpenClaw es un gateway self-hosted que conecta con WhatsApp (vía QR code),
 * Telegram, Signal, etc. Usa la CLI `openclaw message send` para enviar mensajes.
 *
 * @see https://docs.openclaw.ai/cli/message
 */

// Dynamic import to avoid crashing Cloudflare Workers runtime
// (node:child_process is not available in edge runtimes)
async function getExecAsync() {
  const { exec } = await import('node:child_process');
  const { promisify } = await import('node:util');
  return promisify(exec);
}

function getOpenClawCliPath(): string {
  const env = globalThis.process?.env ?? {};
  if (env.OPENCLAW_CLI_PATH) return env.OPENCLAW_CLI_PATH;
  if (env.HOME) return `${env.HOME}/.npm-global/bin/openclaw`;
  return 'openclaw';
}

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
    getOpenClawCliPath(), 'message', 'send',
    '--channel', ch,
    '--target', to,
    '--message', message,
    '--account', account,
    '--json',
  ];

  const cmd = args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ');

  try {
    const execAsync = await getExecAsync();
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
    `🩺 *SALUD* — para hacer un chequeo gratuito por WhatsApp`,
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
    `También podés responder *SALUD* para hacer un chequeo gratuito por WhatsApp.`,
  ].join('\n');
}

/**
 * Parsea la respuesta del paciente a un recordatorio.
 */

/**
 * Genera el mensaje de menu principal con opciones numeradas.
 */
export function buildMainMenu(patientName: string): string {
  const greeting = patientName
    ? "👋 *Hola " + patientName + "! Soy el asistente de AutaMedica.*"
    : "👋 *Hola! Soy el asistente de AutaMedica.*";
  return [
    greeting,
    "",
    "Estoy aca para ayudarte. Elegi una opcion:",
    "",
    "1️⃣ *Agendar turno* — Agenda una consulta medica",
    "2️⃣ *Ver mis turnos* — Consulta tus turnos proximos",
    "3️⃣ *Hablar con un asesor* — Comunicate con una persona",
    "4️⃣ *Chequeo de salud* — Hace un triaje gratuito por WhatsApp",
    "5️⃣ *Anamnesis por audio* — Mandanos un audio con tus sintomas",
    "",
    "Responde con el *numero* de la opcion que queres.",
  ].join('\n');
}

export function parsePatientResponse(
  message: string,
): 'confirmed' | 'cancelled' | 'accepted' | 'menu_schedule' | 'menu_view' | 'menu_advisor' | 'health_check' | 'anamnesis_audio' | null {
  const normalized = message
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // --- MENU PRINCIPAL ---
  if (normalized === '1' || normalized === '1°') return 'menu_schedule';
  if (normalized === '2' || normalized === '2°') return 'menu_view';
  if (normalized === '3' || normalized === '3°') return 'menu_advisor';
  if (normalized === '4' || normalized === '4°') return 'health_check';
  if (normalized === '5' || normalized === '5°') return 'anamnesis_audio';

  const scheduleKeywords = ['agendar', 'agendar turno', 'reservar turno', 'nuevo turno', 'pedir turno', 'sacar turno'];
  for (const kw of scheduleKeywords) if (normalized.includes(kw)) return 'menu_schedule';

  const viewKeywords = ['ver turnos', 'mis turnos', 'ver mis turnos', 'que turnos', 'mis citas', 'proximos turnos', 'lista turnos'];
  for (const kw of viewKeywords) if (normalized.includes(kw)) return 'menu_view';

  const advisorKeywords = ['asesor', 'hablar con', 'atencion al cliente', 'operador', 'humano', 'persona'];
  for (const kw of advisorKeywords) if (normalized.includes(kw)) return 'menu_advisor';

  if (normalized === 'menu' || normalized === 'volver') return null;

  const healthCheckPatterns = [
    'salud', 'misalud', 'mi salud', 'conocer', 'conozco', 'conocerme',
    'chequeo', 'chequear', 'chequeame', 'triage', 'triaje',
    'revision', 'revisar', 'revisame', 'revisa',
    'quiero saber', 'como estoy', 'evaluacion', 'evaluame',
    'analisis', 'analizame', 'consulta gratis', 'gratis',
    'chequeo de salud', 'chequeo medico', 'revision de salud',
    'estado de salud', 'mi estado', 'check', 'checkup', 'check up',
  ];
  for (const pattern of healthCheckPatterns) if (normalized.includes(pattern)) return 'health_check';

  const anamnesisAudioPatterns = [
    'anamnesis por audio',
    'anamnesis audio',
    'audio de salud',
    'mandar audio',
    'enviar audio',
    'audio',
    'nota de voz',
    'mensaje de voz',
    'preanamnesis',
    'pre anamnesis',
  ];
  for (const pattern of anamnesisAudioPatterns) if (normalized.includes(pattern)) return 'anamnesis_audio';

  if (['confirmo', 'si', 'sí', 'ok', 'confirmar', 'confirma', 'voy', 'voy a ir'].includes(normalized)) return 'confirmed';
  if (['cancelo', 'cancelar', 'no', 'cancela', 'no puedo', 'no voy', 'suspender'].includes(normalized)) return 'cancelled';
  if (['acepto', 'aceptar', 'quiero', 'dale', 'tomar', 'agendar', 'reservar'].includes(normalized)) return 'accepted';

  return null;
}

// ==========================================
// Direct CLI send (bypasses LLM agent, most reliable)
// ==========================================

/**
 * Envía un mensaje directo vía `openclaw message send` CLI.
 * NO pasa por el agente LLM — envía el mensaje tal cual por WhatsApp.
 * Este es el método más confiable para recordatorios automatizados.
 */
export async function sendMessageDirect(
  config: OpenClawConfig,
  options: SendMessageOptions,
): Promise<OpenClawResponse> {
  return sendMessage(config, options);
}

/**
 * Envía un mensaje intentando CLI directo.
 * Alias mantenido por compatibilidad con el reminder worker.
 */
export async function sendMessageWithFallback(
  config: OpenClawConfig,
  options: SendMessageOptions,
): Promise<OpenClawResponse> {
  return sendMessage(config, options);
}
