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

const SYSTEM_INSTRUCTION = `Sos un asistente médico de AutaMedica realizando una anamnesis (historia clínica).
Hablá en español argentino informal (voseo), con tono cálido y profesional.
Hacé UNA pregunta por vez, corta y clara.
Cubrí: motivo de consulta, síntomas, duración, intensidad, antecedentes, medicación, alergias.
Si detectás banderas rojas (dolor de pecho, dificultad respiratoria, pérdida de consciencia), mencionalo con calma.
NO diagnostiques ni sugieras tratamientos.
Después de 6-8 preguntas, hacé un resumen breve.`

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
    try {
      const geminiUrl = `${GEMINI_WS_BASE}?key=${apiKey}`
      const geminiResp = await fetch(geminiUrl, {
        headers: { Upgrade: 'websocket' },
      })

      const geminiWs = geminiResp.webSocket
      if (!geminiWs) {
        this.sendToClient({ type: 'error', data: 'Failed to connect to AI' })
        return new Response(null, { status: 101, webSocket: client })
      }

      geminiWs.accept()
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
