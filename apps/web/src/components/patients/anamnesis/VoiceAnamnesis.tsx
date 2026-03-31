'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2 } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'

// ─── Types ───────────────────────────────────────────────────────────
interface VoiceAnamnesisProps {
  onDataExtracted: (data: {
    chiefComplaint: string
    transcript: TranscriptEntry[]
    detectedSections: string[]
  }) => void
  onSwitchToText: () => void
  existingSections?: string[]
}

interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing'

// ─── Audio helpers ───────────────────────────────────────────────────
function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function resample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer
  const ratio = fromRate / toRate
  const newLength = Math.round(buffer.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)]
  }
  return result
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 0x8000
  }
  return float32
}

// ─── Section detection ───────────────────────────────────────────────
const SECTION_KEYWORDS: Record<string, string[]> = {
  motivo_consulta: ['motivo', 'consulta', 'por qué', 'trae'],
  sintomas_actuales: ['síntoma', 'dolor', 'molestia', 'fiebre'],
  antecedentes_personales: ['antecedente', 'operación', 'enfermedad'],
  medicacion_actual: ['medicamento', 'pastilla', 'remedio'],
  alergias: ['alergia', 'alérgico'],
}

function detectSections(text: string): string[] {
  const lower = text.toLowerCase()
  return Object.entries(SECTION_KEYWORDS)
    .filter(([, kw]) => kw.some(k => lower.includes(k)))
    .map(([s]) => s)
}

// ─── Component ───────────────────────────────────────────────────────
export function VoiceAnamnesis({ onDataExtracted, onSwitchToText }: VoiceAnamnesisProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aiText, setAiText] = useState('')

  const wsRef = useRef<WebSocket | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const workletRef = useRef<AudioWorkletNode | null>(null)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const _playbackQueueRef = useRef<Float32Array[]>([])

  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript])

  // Cleanup
  useEffect(() => {
    return () => { cleanup() }
  }, [])

  const cleanup = useCallback(() => {
    workletRef.current?.disconnect()
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    audioContextRef.current?.close()
    wsRef.current?.close()
    wsRef.current = null
    audioContextRef.current = null
    mediaStreamRef.current = null
    workletRef.current = null
  }, [])

  // ── Play received audio ──
  const playAudio = useCallback((audioData: Float32Array) => {
    const ctx = audioContextRef.current
    if (!ctx) return
    const buffer = ctx.createBuffer(1, audioData.length, 24000) // Gemini outputs 24kHz
    buffer.getChannelData(0).set(audioData)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
  }, [])

  // ── Start session ──
  const startSession = useCallback(async () => {
    setState('connecting')
    setError(null)

    try {
      // 1. Get WS URL from our API (server generates sessionId, returns worker URL)
      const tokenData = await fetchApi<{ wsUrl: string; sessionId: string; model: string }>(
        '/api/patients/anamnesis/live-token',
      )

      if (!tokenData?.wsUrl) throw new Error('No se pudo obtener la sesión de voz')

      // 2. Connect WebSocket to our Durable Object proxy
      const ws = new WebSocket(tokenData.wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        logger.info('[VoiceAnamnesis] WebSocket connected to DO proxy')
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)

          if (msg.type === 'connected') {
            setState('listening')
            startMicrophone()
            return
          }

          if (msg.type === 'error') {
            setError(typeof msg.data === 'string' ? msg.data : 'Error de conexión')
            setState('idle')
            return
          }

          if (msg.type === 'session-end') {
            finishConversation()
            return
          }

          // Gemini Live API response: serverContent with audio or text
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              // Audio response
              if (part.inlineData?.data) {
                const audioFloat32 = base64ToFloat32(part.inlineData.data)
                playAudio(audioFloat32)
              }
              // Text transcript (inputTranscription or outputTranscription)
              if (part.text) {
                setAiText(part.text)
                setTranscript(prev => [...prev, {
                  role: 'assistant',
                  text: part.text,
                  timestamp: Date.now(),
                }])
              }
            }
          }

          // Input transcription (what the user said)
          if (msg.serverContent?.inputTranscription) {
            const userText = msg.serverContent.inputTranscription
            setTranscript(prev => [...prev, {
              role: 'user',
              text: userText,
              timestamp: Date.now(),
            }])
          }

          // Output transcription
          if (msg.serverContent?.outputTranscription) {
            setAiText(msg.serverContent.outputTranscription)
          }
        } catch (err) {
          logger.warn('[VoiceAnamnesis] Failed to parse WS message', err)
        }
      }

      ws.onerror = () => {
        setError('Error de conexión con el asistente de voz')
        setState('idle')
      }

      ws.onclose = () => {
        if (state !== 'idle') {
          setState('idle')
        }
      }
    } catch (err) {
      logger.error('[VoiceAnamnesis] Start failed', err)
      setError('No se pudo iniciar la sesión de voz')
      setState('idle')
    }
  }, [playAudio, state])

  // ── Microphone capture ──
  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      })
      mediaStreamRef.current = stream

      const ctx = new AudioContext({ sampleRate: 16000 })
      audioContextRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)

      // Use ScriptProcessorNode (AudioWorklet needs separate file)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0)
        const resampled = resample(input, ctx.sampleRate, 16000)
        const base64 = float32ToBase64Pcm16(resampled)

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                data: base64,
                mimeType: 'audio/pcm;rate=16000',
              }],
            },
          }))
        }
      }

      source.connect(processor)
      processor.connect(ctx.destination)
    } catch (err) {
      logger.error('[VoiceAnamnesis] Microphone failed', err)
      setError('No se pudo acceder al micrófono')
      setState('idle')
    }
  }, [])

  // ── Finish ──
  const finishConversation = useCallback(() => {
    cleanup()
    const entries = transcriptRef.current
    const firstUser = entries.find(e => e.role === 'user')
    const fullText = entries.map(e => e.text).join(' ')

    onDataExtracted({
      chiefComplaint: firstUser?.text ?? '',
      transcript: entries,
      detectedSections: detectSections(fullText),
    })

    setState('idle')
  }, [cleanup, onDataExtracted])

  const isActive = state === 'listening' || state === 'processing'

  return (
    <div className="space-y-4">
      {!isActive && state !== 'connecting' ? (
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
          <p className="text-sm text-stone-500 mb-4">
            Contale a AutaMedica qué te trae a la consulta. La IA te va a hacer preguntas de seguimiento por voz.
          </p>
          <button
            onClick={startSession}
            className="mx-auto flex items-center gap-2 rounded-full bg-sky-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-sky-700"
          >
            <Mic className="h-5 w-5" />
            Iniciar conversación por voz
          </button>
        </div>
      ) : (
        <>
          {/* Transcript */}
          <div className="space-y-3 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
            {transcript.map((entry, i) => (
              <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  entry.role === 'user'
                    ? 'bg-sky-500 text-white'
                    : 'bg-stone-100 text-stone-800'
                }`}>
                  {entry.text}
                </div>
              </div>
            ))}

            {state === 'connecting' && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* AI current text */}
          {aiText && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
              <p className="text-sm text-sky-700">{aiText}</p>
            </div>
          )}

          {/* Mic indicator + controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`h-3 w-3 rounded-full ${
                state === 'listening' ? 'bg-red-500 animate-pulse' : 'bg-stone-300'
              }`} />
              <span className="text-xs text-stone-500">
                {state === 'listening' ? 'Escuchando...' : state === 'connecting' ? 'Conectando...' : 'Procesando...'}
              </span>
            </div>
            <button
              onClick={finishConversation}
              className="flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-700"
            >
              <MicOff className="h-3 w-3" />
              Finalizar
            </button>
          </div>
        </>
      )}

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}

      <button
        onClick={onSwitchToText}
        className="w-full text-center text-sm text-stone-400 underline hover:text-stone-600"
      >
        Prefiero escribir
      </button>
    </div>
  )
}
