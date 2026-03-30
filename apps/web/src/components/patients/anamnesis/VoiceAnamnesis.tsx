'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Volume2, Loader2 } from 'lucide-react'
import { logger } from '@autamedica/shared'
import { fetchApi } from '@/lib/api-client'

// ─── Types ───────────────────────────────────────────────────────────
interface VoiceAnamnesisProps {
  /** Called when conversation produces structured data to save */
  onDataExtracted: (data: {
    chiefComplaint: string
    transcript: TranscriptEntry[]
    detectedSections: string[]
  }) => void
  /** Called when user wants to switch to text mode */
  onSwitchToText: () => void
  /** Existing sections already filled */
  existingSections?: string[]
}

interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'speaking' | 'listening' | 'error'

// ─── System prompt for medical anamnesis ─────────────────────────────
const SYSTEM_INSTRUCTION = `Sos un asistente médico de AutaMedica. Tu rol es hacer la anamnesis (historia clínica) del paciente de forma conversacional y empática.

REGLAS:
- Hablá en español argentino informal (voseo), con tono cálido y profesional
- Empezá preguntando el motivo de consulta
- Hacé UNA pregunta por vez, esperá la respuesta antes de seguir
- Preguntas cortas y claras, como hablaría un médico en consultorio
- Cubrí: motivo de consulta, síntomas actuales, duración, intensidad, antecedentes relevantes, medicación actual, alergias
- Si detectás banderas rojas (dolor de pecho, dificultad para respirar, pérdida de consciencia), mencionalo con calma
- NO diagnostiques ni sugieras tratamientos
- Después de 6-8 preguntas, hacé un resumen breve de lo que registraste
- Si el paciente dice algo confuso, pedí aclaración con amabilidad
- Máximo 10 preguntas en total, luego cerrá la conversación agradeciendo`

// ─── Audio utilities ─────────────────────────────────────────────────
function float32ToPcm16(float32: Float32Array): ArrayBuffer {
  const pcm = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return pcm.buffer
}

function pcm16ToFloat32(pcmBuffer: ArrayBuffer): Float32Array {
  const pcm = new Int16Array(pcmBuffer)
  const float32 = new Float32Array(pcm.length)
  for (let i = 0; i < pcm.length; i++) {
    float32[i] = pcm[i] / (pcm[i] < 0 ? 0x8000 : 0x7fff)
  }
  return float32
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// ─── Downsample from browser's sample rate to 16kHz ──────────────────
function downsampleTo16k(buffer: Float32Array, fromRate: number): Float32Array {
  if (fromRate === 16000) return buffer
  const ratio = fromRate / 16000
  const newLength = Math.round(buffer.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)]
  }
  return result
}

// ─── Component ───────────────────────────────────────────────────────
export function VoiceAnamnesis({ onDataExtracted, onSwitchToText, existingSections: _existingSections }: VoiceAnamnesisProps) {
  const [state, setState] = useState<ConnectionState>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentText, setCurrentText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const playbackQueueRef = useRef<Float32Array[]>([])
  const isPlayingRef = useRef(false)
  const transcriptRef = useRef<TranscriptEntry[]>([])

  // Keep ref in sync
  useEffect(() => { transcriptRef.current = transcript }, [transcript])

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [])

  // ── Play queued audio chunks ──
  const playNextChunk = useCallback(() => {
    if (isPlayingRef.current || playbackQueueRef.current.length === 0) return
    const ctx = audioContextRef.current
    if (!ctx) return

    isPlayingRef.current = true
    const chunk = playbackQueueRef.current.shift()
    if (!chunk) return

    // Gemini outputs 24kHz, resample to AudioContext rate
    const ratio = ctx.sampleRate / 24000
    const resampled = new Float32Array(Math.round(chunk.length * ratio))
    for (let i = 0; i < resampled.length; i++) {
      resampled[i] = chunk[Math.round(i / ratio)] ?? 0
    }

    const buffer = ctx.createBuffer(1, resampled.length, ctx.sampleRate)
    buffer.copyToChannel(resampled, 0)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => {
      isPlayingRef.current = false
      playNextChunk()
    }
    source.start()
  }, [])

  // ── Connect to Gemini Live ──
  const connect = useCallback(async () => {
    setState('connecting')
    setError(null)

    try {
      // 1. Get secure token from our API
      const tokenData = await fetchApi<{ wsUrl: string; model: string }>(
        '/api/patients/anamnesis/live-token',
      )
      if (!tokenData?.wsUrl) {
        throw new Error('No se pudo obtener acceso al servicio de voz')
      }

      // 2. Get microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
      mediaStreamRef.current = stream

      // 3. Create AudioContext
      const ctx = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = ctx

      // 4. Connect WebSocket
      const ws = new WebSocket(tokenData.wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        logger.info('[VoiceAnamnesis] WebSocket connected, sending setup')

        // Send setup message
        ws.send(JSON.stringify({
          setup: {
            model: tokenData.model,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: 'Aoede', // warm female voice
                  },
                },
              },
            },
            systemInstruction: {
              parts: [{ text: SYSTEM_INSTRUCTION }],
            },
          },
        }))
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          // Setup complete
          if (msg.setupComplete) {
            logger.info('[VoiceAnamnesis] Setup complete, starting mic')
            setState('connected')
            startMicrophone(ctx, stream, ws)
            return
          }

          // Server audio response
          if (msg.serverContent?.modelTurn?.parts) {
            setState('speaking')
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                const pcmBuffer = base64ToArrayBuffer(part.inlineData.data)
                const float32 = pcm16ToFloat32(pcmBuffer)
                playbackQueueRef.current.push(float32)
                playNextChunk()
              }
            }
          }

          // Transcriptions
          if (msg.serverContent?.outputTranscription?.text) {
            const text = msg.serverContent.outputTranscription.text
            setCurrentText(prev => prev + text)
          }

          // Turn complete — save transcript
          if (msg.serverContent?.turnComplete) {
            setCurrentText(prev => {
              if (prev.trim()) {
                setTranscript(t => [...t, { role: 'assistant', text: prev.trim(), timestamp: Date.now() }])
              }
              return ''
            })
            setState('listening')
          }

          // Input transcription (what the user said)
          if (msg.serverContent?.inputTranscription?.text) {
            const userText = msg.serverContent.inputTranscription.text
            if (userText.trim()) {
              setTranscript(t => [...t, { role: 'user', text: userText.trim(), timestamp: Date.now() }])
            }
          }
        } catch (err) {
          logger.error('[VoiceAnamnesis] Message parse error', err)
        }
      }

      ws.onerror = (err) => {
        logger.error('[VoiceAnamnesis] WebSocket error', err)
        setError('Error de conexión con el servicio de voz')
        setState('error')
      }

      ws.onclose = (ev) => {
        logger.info('[VoiceAnamnesis] WebSocket closed', { code: ev.code })
        if (state !== 'idle') {
          finishConversation()
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      logger.error('[VoiceAnamnesis] Connect failed', err)
      setError(msg)
      setState('error')
    }
  }, [playNextChunk])

  // ── Start sending microphone audio ──
  const startMicrophone = useCallback((ctx: AudioContext, stream: MediaStream, ws: WebSocket) => {
    const source = ctx.createMediaStreamSource(stream)
    // ScriptProcessorNode: deprecated but widely supported. Worklet requires more setup.
    const processor = ctx.createScriptProcessor(4096, 1, 1)
    processorRef.current = processor

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return
      const inputData = e.inputBuffer.getChannelData(0)
      const downsampled = downsampleTo16k(inputData, ctx.sampleRate)
      const pcm = float32ToPcm16(downsampled)
      const base64 = arrayBufferToBase64(pcm)

      ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            data: base64,
            mimeType: 'audio/pcm;rate=16000',
          }],
        },
      }))
    }

    source.connect(processor)
    processor.connect(ctx.destination)
    setState('listening')
  }, [])

  // ── Disconnect everything ──
  const disconnect = useCallback(() => {
    processorRef.current?.disconnect()
    processorRef.current = null
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    mediaStreamRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null
    wsRef.current?.close()
    wsRef.current = null
    playbackQueueRef.current = []
    isPlayingRef.current = false
  }, [])

  // ── Finish and extract data ──
  const finishConversation = useCallback(() => {
    disconnect()
    setState('idle')

    const entries = transcriptRef.current
    if (entries.length === 0) return

    // Extract chief complaint from first user message
    const firstUserMsg = entries.find(e => e.role === 'user')
    const chiefComplaint = firstUserMsg?.text ?? ''

    // Detect sections mentioned
    const fullText = entries.map(e => e.text).join(' ').toLowerCase()
    const sectionKeywords: Record<string, string[]> = {
      motivo_consulta: ['motivo', 'consulta', 'por qué venís'],
      sintomas_actuales: ['síntoma', 'dolor', 'molestia', 'fiebre'],
      antecedentes_personales: ['antecedente', 'operación', 'cirugía', 'enfermedad previa'],
      medicacion_actual: ['medicamento', 'medicación', 'pastilla', 'remedio'],
      alergias: ['alergia', 'alérgico'],
      antecedentes_familiares: ['familia', 'padre', 'madre', 'hermano'],
      habitos: ['fumás', 'alcohol', 'ejercicio', 'drogas'],
    }

    const detectedSections = Object.entries(sectionKeywords)
      .filter(([, keywords]) => keywords.some(k => fullText.includes(k)))
      .map(([section]) => section)

    onDataExtracted({ chiefComplaint, transcript: entries, detectedSections })
  }, [disconnect, onDataExtracted])

  // ── Stop conversation ──
  const stopConversation = useCallback(() => {
    finishConversation()
  }, [finishConversation])

  // ── UI state helpers ──
  const isActive = state === 'connected' || state === 'listening' || state === 'speaking'
  const statusText: Record<ConnectionState, string> = {
    idle: 'Iniciá la conversación con voz',
    connecting: 'Conectando...',
    connected: 'Conectado, empezá a hablar',
    listening: 'Escuchando...',
    speaking: 'AutaMedica está respondiendo...',
    error: error ?? 'Error de conexión',
  }

  return (
    <div className="space-y-4">
      {/* Status + controls */}
      <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-sky-600 mb-4">
          Anamnesis por voz
        </p>

        {/* Mic button */}
        <button
          onClick={isActive ? stopConversation : connect}
          disabled={state === 'connecting'}
          className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full transition-all duration-300 ${
            isActive
              ? 'bg-red-500 shadow-lg shadow-red-200 hover:bg-red-600 animate-pulse'
              : state === 'connecting'
                ? 'bg-stone-300 cursor-wait'
                : 'bg-sky-500 shadow-lg shadow-sky-200 hover:bg-sky-600'
          }`}
        >
          {state === 'connecting' ? (
            <Loader2 className="h-8 w-8 text-white animate-spin" />
          ) : isActive ? (
            <MicOff className="h-8 w-8 text-white" />
          ) : (
            <Mic className="h-8 w-8 text-white" />
          )}
        </button>

        <p className="mt-3 text-sm text-stone-600">{statusText[state]}</p>

        {state === 'speaking' && (
          <div className="mt-2 flex items-center justify-center gap-1 text-sky-600">
            <Volume2 className="h-4 w-4" />
            <span className="text-xs">Reproduciendo respuesta</span>
          </div>
        )}
      </div>

      {/* Live transcription */}
      {currentText && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
          <p className="text-sm text-sky-800 italic">{currentText}</p>
        </div>
      )}

      {/* Transcript history */}
      {transcript.length > 0 && (
        <div className="space-y-3 max-h-64 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-medium text-stone-400 uppercase tracking-wider">Conversación</p>
          {transcript.map((entry, i) => (
            <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                entry.role === 'user'
                  ? 'bg-sky-500 text-white'
                  : 'bg-stone-100 text-stone-800'
              }`}>
                {entry.text}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Switch to text */}
      <button
        onClick={onSwitchToText}
        className="w-full text-center text-sm text-stone-400 underline hover:text-stone-600 transition-colors"
      >
        Prefiero escribir
      </button>
    </div>
  )
}
