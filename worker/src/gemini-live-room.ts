/**
 * Durable Object: Proxies browser WebSocket ↔ Gemini Live API WebSocket.
 * API key stays server-side. Browser sends/receives audio via this proxy.
 *
 * Flow:
 * 1. Browser connects to /gemini-live?sessionId=xxx
 * 2. DO connects outbound to Gemini Live API with server-side API key
 * 3. Browser audio → DO → Gemini. Gemini audio → DO → Browser.
 * 4. Session auto-closes after 10 min or on disconnect.
 */

import type {
  Env,
  GeminiLiveClientMessage,
  GeminiLivePatientContext,
  GeminiLiveSessionConfig,
} from './types'

const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview'
const GEMINI_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const MAX_SESSION_DURATION_MS = 10 * 60 * 1000 // 10 min
const MAX_MESSAGES = 500 // safety cap
const SESSION_CONFIG_TIMEOUT_MS = 1_500

const DEFAULT_SESSION_CONFIG: GeminiLiveSessionConfig = {
  mode: 'general',
  patient: { name: null, age: null, completedSections: [] },
  guidanceQuestions: [],
  coverageGaps: [],
  maxModelTurns: 8,
}

function formatPatientContext(patient: GeminiLivePatientContext): string {
  const details: string[] = []
  if (patient.name) {
    details.push(`- Nombre: ${patient.name}`)
  }
  if (typeof patient.age === 'number') {
    details.push(`- Edad: ${patient.age} años`)
  }
  if (patient.completedSections.length > 0) {
    details.push(`- Secciones ya registradas: ${patient.completedSections.join(', ')}`)
  }

  if (details.length === 0) {
    return ''
  }

  return `\nCONTEXTO DEL PACIENTE:\n${details.join('\n')}\n`
}

function buildGeneralSystemInstruction(config: GeminiLiveSessionConfig): string {
  return `Sos un médico residente de AutaMedica realizando una anamnesis estructurada por voz.
${formatPatientContext(config.patient)}
PROTOCOLO — Seguí este orden EXACTO, un bloque por mensaje:

BLOQUE 1 — Motivo de consulta: preguntá qué le pasa y desde cuándo.
BLOQUE 2 — Enfermedad actual: temporalidad, intensidad (1-10), factores agravantes y atenuantes.
BLOQUE 3 — Antecedentes personales: enfermedades previas, cirugías, internaciones.
BLOQUE 4 — Medicación actual: qué toma, dosis si la sabe.
BLOQUE 5 — Alergias: medicamentos, alimentos, otros.
BLOQUE 6 — Hábitos: tabaco, alcohol, ejercicio, sueño (todo en una pregunta).
BLOQUE 7 — Revisión por sistemas: según el motivo, 1-2 síntomas asociados.
BLOQUE 8 — Cierre: resumen de 3-4 líneas confirmando lo registrado.

REGLAS:
- UNA pregunta por mensaje, corta y directa
- Español argentino informal (voseo), tono cálido
- Hablá SIEMPRE en segunda persona dirigiéndote al paciente (vos tenés, no el paciente tiene)
- NUNCA hables del paciente en tercera persona
- Si el paciente ya dio información de un bloque, saltalo
- Banderas rojas (dolor de pecho, dificultad respiratoria, pérdida de consciencia): mencionalo con calma
- NO diagnostiques ni sugieras tratamientos
- NO uses abreviaturas médicas (decí tensión arterial, no TA)
- Después del BLOQUE 8, despedite brevemente`
}

function buildGuidedCheckpointInstruction(config: GeminiLiveSessionConfig): string {
  const checkpointLabel = config.checkpoint === 'final' ? 'FINAL' : 'PARCIAL'
  const questions = config.guidanceQuestions.length > 0
    ? config.guidanceQuestions.map((question, index) => `${index + 1}. ${question}`).join('\n')
    : '- Pedí una aclaración clínica puntual.'
  const gaps = config.coverageGaps.length > 0 ? config.coverageGaps.join(', ') : 'sin especificar'

  return `Sos un médico residente de AutaMedica realizando una ACLARACION POR VOZ sobre una anamnesis ya iniciada.
${formatPatientContext(config.patient)}
CHECKPOINT ACTUAL: ${checkpointLabel}
RESUMEN DE COBERTURA: ${config.coverageSummary ?? 'Sin resumen'}
AREAS CON DATOS FALTANTES: ${gaps}
PREGUNTAS PRIORITARIAS:
${questions}

OBJETIVO:
- Pedí aclaraciones breves solo sobre lo que falta.
- Hacé UNA sola pregunta por turno.
- Si el paciente ya respondió algo prioritario, pasá a lo siguiente sin repetir.
- Máximo ${config.maxModelTurns} preguntas del modelo antes del cierre.

REGLAS:
- Español argentino informal (voseo), tono cálido y profesional.
- Hablá SIEMPRE en segunda persona.
- Máximo 18 palabras o 160 caracteres por turno cuando preguntes.
- No abras bloques nuevos ni hagas una anamnesis completa desde cero.
- No diagnostiques ni sugieras tratamientos.
- No uses abreviaturas médicas.

FINALIZACIÓN OBLIGATORIA:
Cuando ya tengas suficiente información o agotes las preguntas prioritarias:
1. Llamá a la función complete_checkpoint pasándole un breve resumen de lo que acabás de aclarar.
2. NO hagas más preguntas ni hables después de llamar a la función.`
}

function buildSystemInstruction(config: GeminiLiveSessionConfig): string {
  if (config.mode === 'guided_checkpoint') {
    return buildGuidedCheckpointInstruction(config)
  }

  return buildGeneralSystemInstruction(config)
}

function parseSessionConfigMessage(raw: string): GeminiLiveSessionConfig | null {
  try {
    const parsed = JSON.parse(raw) as GeminiLiveClientMessage | Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || parsed.type !== 'session_config') {
      return null
    }

    const data = (parsed as GeminiLiveClientMessage).data
    if (!data || typeof data !== 'object' || !data.patient || typeof data.patient !== 'object') {
      return null
    }

    return {
      mode: data.mode === 'guided_checkpoint' ? 'guided_checkpoint' : 'general',
      checkpoint: data.checkpoint === 'final' || data.checkpoint === 'partial'
        ? data.checkpoint
        : undefined,
      patient: {
        name: typeof data.patient.name === 'string' && data.patient.name.trim().length > 0
          ? data.patient.name.trim()
          : null,
        age: typeof data.patient.age === 'number' ? data.patient.age : null,
        completedSections: Array.isArray(data.patient.completedSections)
          ? data.patient.completedSections.filter((value): value is string => typeof value === 'string')
          : [],
      },
      guidanceQuestions: Array.isArray(data.guidanceQuestions)
        ? data.guidanceQuestions.filter((value): value is string => typeof value === 'string')
        : [],
      coverageGaps: Array.isArray(data.coverageGaps)
        ? data.coverageGaps.filter((value): value is string => typeof value === 'string')
        : [],
      coverageSummary: typeof data.coverageSummary === 'string' ? data.coverageSummary : undefined,
      maxModelTurns: typeof data.maxModelTurns === 'number' && data.maxModelTurns > 0
        ? data.maxModelTurns
        : DEFAULT_SESSION_CONFIG.maxModelTurns,
    }
  } catch {
    return null
  }
}

export class GeminiLiveRoom implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private geminiWs: WebSocket | null = null
  private clientWs: WebSocket | null = null
  private messageCount = 0
  private sessionTimer: ReturnType<typeof setTimeout> | null = null
  private sessionConfigTimer: ReturnType<typeof setTimeout> | null = null
  private setupSent = false

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade')
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 })
    }

    // Only 1 client per session
    if (this.clientWs) {
      return new Response(
        JSON.stringify({ type: 'error', data: 'Session already in use' }),
        { status: 409, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const apiKey = this.env.GEMINI_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ type: 'error', data: 'AI not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Accept client WebSocket
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    this.state.acceptWebSocket(server, ['gemini-live'])
    this.clientWs = server

    // Connect to Gemini Live API (outbound WebSocket from DO)
    // NOTE: Cloudflare Workers cannot use fetch() with wss:// URLs.
    // Must use the standard WebSocket constructor for outbound WS connections.
    try {
      const geminiUrl = `${GEMINI_WS_BASE}?key=${apiKey}`
      let geminiWs: WebSocket
      try {
        geminiWs = new WebSocket(geminiUrl)
      } catch (wsErr) {
        const msg = wsErr instanceof Error ? wsErr.message : String(wsErr)
        this.sendToClient({ type: 'error', data: `Gemini WS connect failed: ${msg}` })
        return new Response(null, { status: 101, webSocket: client })
      }

      // Wait for Gemini WS to open
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Gemini WS open timeout')), 10000)
        geminiWs.addEventListener('open', () => { clearTimeout(timeout); resolve() })
        geminiWs.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Gemini WS open error')) })
      })

      this.geminiWs = geminiWs

      // Gemini → Client relay
      this.geminiWs.addEventListener('message', (event) => {
        if (this.clientWs) {
          try {
            this.clientWs.send(typeof event.data === 'string' ? event.data : event.data)
          } catch { /* client disconnected */ }
        }
      })

      this.geminiWs.addEventListener('close', () => {
        this.sendToClient({ type: 'session-end', data: 'AI session ended' })
        this.cleanup()
      })

      this.geminiWs.addEventListener('error', () => {
        this.sendToClient({ type: 'error', data: 'AI connection error' })
        this.cleanup()
      })

      this.startSessionConfigFallback()

      // Auto-close after MAX_SESSION_DURATION_MS
      this.sessionTimer = setTimeout(() => {
        this.sendToClient({ type: 'session-end', data: 'Session time limit reached (10 min)' })
        this.cleanup()
      }, MAX_SESSION_DURATION_MS)
    } catch (err) {
      this.sendToClient({ type: 'error', data: 'Failed to initialize AI session' })
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  // Client → Gemini relay
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message === 'string' && !this.setupSent) {
      const sessionConfig = parseSessionConfigMessage(message)
      if (sessionConfig) {
        this.initializeGeminiSession(sessionConfig)
        return
      }
    }

    this.messageCount++
    if (this.messageCount > MAX_MESSAGES) {
      this.sendToClient({ type: 'error', data: 'Message limit reached' })
      this.cleanup()
      return
    }

    if (!this.setupSent) {
      this.initializeGeminiSession(DEFAULT_SESSION_CONFIG)
    }

    // Forward to Gemini as-is (client sends realtimeInput audio chunks)
    if (this.geminiWs) {
      try {
        this.geminiWs.send(message)
      } catch {
        this.sendToClient({ type: 'error', data: 'AI connection lost' })
        this.cleanup()
      }
    }
  }

  async webSocketClose(): Promise<void> {
    this.cleanup()
  }

  async webSocketError(): Promise<void> {
    this.cleanup()
  }

  private sendToClient(msg: { type: string; data: unknown }): void {
    if (this.clientWs) {
      try {
        this.clientWs.send(JSON.stringify(msg))
      } catch { /* already closed */ }
    }
  }

  private startSessionConfigFallback(): void {
    if (this.sessionConfigTimer) {
      clearTimeout(this.sessionConfigTimer)
    }

    this.sessionConfigTimer = setTimeout(() => {
      this.initializeGeminiSession(DEFAULT_SESSION_CONFIG)
    }, SESSION_CONFIG_TIMEOUT_MS)
  }

  private initializeGeminiSession(config: GeminiLiveSessionConfig): void {
    if (!this.geminiWs || this.setupSent) {
      return
    }

    if (this.sessionConfigTimer) {
      clearTimeout(this.sessionConfigTimer)
      this.sessionConfigTimer = null
    }

    const setupMsg = {
      setup: {
        model: GEMINI_MODEL,
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' },
            },
          },
        },
        tools: config.mode === 'guided_checkpoint' ? [{
          functionDeclarations: [{
            name: 'complete_checkpoint',
            description: 'Llamá a esta función cuando hayas obtenido la información necesaria o agotado las preguntas prioritarias para finalizar la aclaración.',
            parameters: {
              type: 'object',
              properties: {
                summary: {
                  type: 'string',
                  description: 'Un breve resumen (1-2 oraciones) de lo que el paciente acaba de aclarar.',
                },
              },
              required: ['summary'],
            },
          }],
        }] : undefined,
        systemInstruction: {
          parts: [{ text: buildSystemInstruction(config) }],
        },
      },
    }

    this.geminiWs.send(JSON.stringify(setupMsg))
    this.setupSent = true
    this.sendToClient({
      type: 'connected',
      data: {
        model: GEMINI_MODEL,
        sessionMode: config.mode,
        checkpoint: config.checkpoint ?? null,
      },
    })
  }

  private cleanup(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }
    if (this.sessionConfigTimer) {
      clearTimeout(this.sessionConfigTimer)
      this.sessionConfigTimer = null
    }
    try { this.geminiWs?.close(1000, 'Session ended') } catch { /* ignore */ }
    try { this.clientWs?.close(1000, 'Session ended') } catch { /* ignore */ }
    this.geminiWs = null
    this.clientWs = null
    this.messageCount = 0
    this.setupSent = false
  }
}
