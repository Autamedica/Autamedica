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

import type { Env } from './types'

const GEMINI_MODEL = 'models/gemini-3.1-flash-live-preview'
const GEMINI_WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
const MAX_SESSION_DURATION_MS = 10 * 60 * 1000 // 10 min
const MAX_MESSAGES = 500 // safety cap

const SYSTEM_INSTRUCTION = `Sos un médico residente de AutaMedica realizando una anamnesis estructurada por voz.

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
- Si el paciente ya dio información de un bloque, saltalo
- Banderas rojas (dolor de pecho, dificultad respiratoria, pérdida de consciencia): mencionalo con calma
- NO diagnostiques ni sugieras tratamientos
- NO uses abreviaturas médicas (decí tensión arterial, no TA)
- Después del BLOQUE 8, despedite brevemente`

export class GeminiLiveRoom implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private geminiWs: WebSocket | null = null
  private clientWs: WebSocket | null = null
  private messageCount = 0
  private sessionTimer: ReturnType<typeof setTimeout> | null = null

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

      // Send Gemini setup config
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
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
        },
      }
      this.geminiWs.send(JSON.stringify(setupMsg))

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

      // Auto-close after MAX_SESSION_DURATION_MS
      this.sessionTimer = setTimeout(() => {
        this.sendToClient({ type: 'session-end', data: 'Session time limit reached (10 min)' })
        this.cleanup()
      }, MAX_SESSION_DURATION_MS)

      // Confirm ready to client
      this.sendToClient({ type: 'connected', data: { model: GEMINI_MODEL } })
    } catch (err) {
      this.sendToClient({ type: 'error', data: 'Failed to initialize AI session' })
    }

    return new Response(null, { status: 101, webSocket: client })
  }

  // Client → Gemini relay
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.messageCount++
    if (this.messageCount > MAX_MESSAGES) {
      this.sendToClient({ type: 'error', data: 'Message limit reached' })
      this.cleanup()
      return
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

  private cleanup(): void {
    if (this.sessionTimer) {
      clearTimeout(this.sessionTimer)
      this.sessionTimer = null
    }
    try { this.geminiWs?.close(1000, 'Session ended') } catch { /* ignore */ }
    try { this.clientWs?.close(1000, 'Session ended') } catch { /* ignore */ }
    this.geminiWs = null
    this.clientWs = null
    this.messageCount = 0
  }
}
