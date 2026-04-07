'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { sanitizeForTTS, segmentForTTS } from '@/lib/patients/utils/tts-sanitizer'
import { logger } from '@autamedica/shared'
import type { ExtractionGuidance } from '@/lib/patients/services/anamnesis-guidance.service'

interface VoiceAnamnesisProps {
  onDataExtracted: (data: {
    chiefComplaint: string
    transcript: TranscriptEntry[]
    detectedSections: string[]
    extractedFields?: Record<string, string>
  }) => void
  onSwitchToText: () => void
  existingSections?: string[]
  guidance?: ExtractionGuidance | null
  checkpoint?: 'partial' | 'final'
  forceRelay?: boolean
}

interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

type VoiceState = 'idle' | 'connecting' | 'live' | 'listening' | 'processing' | 'speaking' | 'completed'

// SpeechRecognition types in src/types/speech-recognition.d.ts

type ConnectionMode = 'live' | 'relay'
type CheckpointMode = 'partial' | 'final'

interface RelayResponse {
  text: string
  history: Array<{ role: 'user' | 'model'; text: string }>
  isComplete: boolean
  turnCount: number
  modelTurnCount: number
  extractedFields?: Record<string, string>
}

interface LiveSessionConfig {
  mode: 'general' | 'guided_checkpoint'
  checkpoint?: CheckpointMode
  patient: {
    name: string | null
    age: number | null
    completedSections: string[]
    sectionData?: Record<string, Record<string, unknown>>
  }
  guidanceQuestions: string[]
  coverageGaps: string[]
  coverageSummary?: string
  maxModelTurns: number
}

interface LiveTokenResponse {
  ephemeralToken?: string
  wsUrl?: string
  sessionId?: string
  model: string
  sessionConfig: LiveSessionConfig
}

const TOTAL_BLOCKS = 8
const LIVE_COMPLETION_TAG = '[CHECKPOINT_COMPLETO]'
const PLAYBACK_GUARD_MS = 350

function getTranscriptionText(transcription: unknown): string | null {
  if (!transcription) return null
  if (typeof transcription === 'string') {
    const text = transcription.trim()
    return text || null
  }
  if (typeof transcription === 'object' && 'text' in transcription) {
    const maybeText = (transcription as { text?: unknown }).text
    const text = typeof maybeText === 'string' ? maybeText.trim() : String(maybeText ?? '').trim()
    if (!text) return null
    if ('finished' in transcription && (transcription as { finished?: boolean }).finished === false) {
      return null
    }
    return text
  }
  return null
}

function summarizeSectionData(sectionData?: Record<string, Record<string, unknown>>): string {
  if (!sectionData || Object.keys(sectionData).length === 0) return ''
  const lines: string[] = []
  for (const [section, data] of Object.entries(sectionData)) {
    const entries = Object.entries(data)
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    if (entries.length > 0) {
      lines.push(`[${section}] ${entries.join('; ')}`)
    }
  }
  return lines.join('\n')
}

function buildGuidedCheckpointInstruction(config: LiveSessionConfig): string {
  const name = config.patient.name ?? 'paciente'
  const age = config.patient.age ? `, ${config.patient.age} años` : ''
  const completed = config.patient.completedSections.join(', ') || 'ninguna'
  const existingData = summarizeSectionData(config.patient.sectionData)
  const gaps = config.coverageGaps.length > 0
    ? `\n\nÁreas con información insuficiente:\n- ${config.coverageGaps.join('\n- ')}`
    : ''
  const questions = config.guidanceQuestions.length > 0
    ? `\n\nPreguntas específicas a explorar:\n- ${config.guidanceQuestions.join('\n- ')}`
    : ''
  const summary = config.coverageSummary
    ? `\n\nResumen del análisis previo: ${config.coverageSummary}`
    : ''

  return `Sos un médico residente de AutaMedica realizando una refinación semiológica por voz.

Paciente: ${name}${age}.
Secciones ya completadas: ${completed}.
${existingData ? `\nDatos ya registrados del formulario:\n${existingData}` : ''}
${summary}${gaps}${questions}

INSTRUCCIONES:
- NO repitas preguntas que ya fueron respondidas en los datos del formulario.
- Tu objetivo es REFINAR semiológicamente: profundizar en síntomas reportados, explorar características (localización, irradiación, intensidad, duración, factores agravantes/atenuantes, temporalidad).
- Si el paciente reportó un síntoma, preguntá detalles clínicos: ¿desde cuándo? ¿cómo es el dolor? ¿qué lo mejora o empeora? ¿se asocia con algo?
- Hacé UNA pregunta por turno, máximo ${config.maxModelTurns} preguntas.
- Español argentino informal (vos, tuteo).
- Sé breve y directo — esto es voz, no texto.`
}

function resample(buf: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return buf
  const ratio = from / to
  const len = Math.round(buf.length / ratio)
  const out = new Float32Array(len)
  for (let i = 0; i < len; i++) out[i] = buf[Math.round(i * ratio)]
  return out
}

function float32ToBase64Pcm16(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length)
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]))
    i16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(i16.buffer)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

function base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const i16 = new Int16Array(bytes.buffer)
  const f32 = new Float32Array(i16.length)
  for (let i = 0; i < i16.length; i++) f32[i] = i16[i] / 0x8000
  return f32
}

export function VoiceAnamnesis({
  onDataExtracted,
  onSwitchToText,
  guidance,
  checkpoint,
  forceRelay = false,
}: VoiceAnamnesisProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [mode, setMode] = useState<ConnectionMode | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [relayHistory, setRelayHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([])
  const [currentInput, setCurrentInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [modelTurns, setModelTurns] = useState(0)
  const [relayOpeningTurnCount, setRelayOpeningTurnCount] = useState(0)
  const [extractedFields, setExtractedFields] = useState<Record<string, string> | null>(null)
  const [summaryText, setSummaryText] = useState('')
  const [vadThreshold, setVadThreshold] = useState(0.015)

  const vadActiveRef = useRef(false)
  const lastAudioTimeRef = useRef<number>(0)
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const audioQueueTimeRef = useRef<number>(0)
  const playbackGuardUntilRef = useRef<number>(0)

  const guidanceQuestions = useRef<string[]>([])
  const coverageGaps = useRef<string[]>([])
  const coverageSummary = guidance?.coverageSummary
  const isGuidedCheckpoint = Boolean(
    checkpoint && (guidance?.questions?.length || guidance?.gaps?.length),
  )

  useEffect(() => {
    guidanceQuestions.current = guidance?.questions.map((question) => question.text) ?? []
    coverageGaps.current = guidance?.gaps ?? []
  }, [guidance])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const currentInputRef = useRef('')
  const ttsSessionRef = useRef(0)
  const ttsTimeoutRef = useRef<number | null>(null)
  const autoStartAttemptedRef = useRef(false)
  const startSTTRef = useRef<() => void>(() => {})
  const startRelayModeRef = useRef<() => Promise<void>>(async () => {})
  const finishRef = useRef<() => void>(() => {})
  const stateRef = useRef<VoiceState>('idle')

  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { currentInputRef.current = currentInput }, [currentInput])
  useEffect(() => { stateRef.current = state }, [state])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript])
  const clearTTSTimeout = useCallback(() => {
    if (ttsTimeoutRef.current !== null) {
      window.clearTimeout(ttsTimeoutRef.current)
      ttsTimeoutRef.current = null
    }
  }, [])

  const stopTTS = useCallback(() => {
    ttsSessionRef.current += 1
    clearTTSTimeout()
    window.speechSynthesis?.cancel()
  }, [clearTTSTimeout])

  const stopAllAudio = useCallback(() => {
    activeSourcesRef.current.forEach(src => {
      try { src.stop() } catch { /* ignore */ }
    })
    activeSourcesRef.current.clear()
    audioQueueTimeRef.current = 0
  }, [])

  const cleanup = useCallback(() => {
    recognitionRef.current?.abort()
    mediaStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop())
    stopAllAudio()
    audioCtxRef.current?.close().catch(() => {})
    wsRef.current?.close()
    stopTTS()
    wsRef.current = null; audioCtxRef.current = null; mediaStreamRef.current = null
  }, [stopTTS, stopAllAudio])

  useEffect(() => { return () => cleanup() }, [cleanup])

  const addEntry = useCallback((role: 'user' | 'assistant', text: unknown) => {
    let resolvedText = '';
    if (typeof text === 'string') {
      resolvedText = text;
    } else if (text && typeof text === 'object' && 'text' in text) {
      resolvedText = String(text.text);
    } else {
      resolvedText = String(text);
    }
    setTranscript(prev => [...prev, { role, text: resolvedText, timestamp: Date.now() }])
  }, [])

  const playAudio = useCallback((data: Float32Array) => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const buf = ctx.createBuffer(1, data.length, 24000)
    buf.getChannelData(0).set(data)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    
    // Queue sequentially to avoid overlapping
    const currentTime = ctx.currentTime
    if (audioQueueTimeRef.current < currentTime) {
      audioQueueTimeRef.current = currentTime
    }
    src.start(audioQueueTimeRef.current)
    audioQueueTimeRef.current += buf.duration

    activeSourcesRef.current.add(src)
    src.onended = () => {
      activeSourcesRef.current.delete(src)
      if (activeSourcesRef.current.size === 0) {
        playbackGuardUntilRef.current = Date.now() + PLAYBACK_GUARD_MS
      }
    }
  }, [])

  // ══════════════════════════════════════════════
  // START — Try Gemini Live first, fallback to relay
  // ══════════════════════════════════════════════
  const start = useCallback(async () => {
    setState('connecting')
    setError(null)

    // Bypass Autoplay Policy: Initialize AudioContext synchronously attached to the user gesture
    let ctx = audioCtxRef.current
    if (!ctx || ctx.state === 'closed') {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new AudioContextCtor({ sampleRate: 16000 })
      audioCtxRef.current = ctx
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    if (forceRelay) {
      await startRelayModeRef.current()
      return
    }

    // Step 1: Request mic BEFORE connecting WebSocket
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      mediaStreamRef.current = stream
    } catch {
      logger.warn('[Voice] Mic denied, falling back to relay')
      await startRelayModeRef.current()
      return
    }

    // Step 2: Get token/URL
    try {
      // Read guidance directly from prop (not refs) to avoid stale data race
      const questionsForToken = guidance?.questions?.map((q) => q.text) ?? guidanceQuestions.current
      const gapsForToken = guidance?.gaps ?? coverageGaps.current
      const summaryForToken = guidance?.coverageSummary ?? coverageSummary

      const tokenData = await fetchApi<LiveTokenResponse>(
        '/api/patients/anamnesis/live-token',
        {
          method: 'POST',
          body: {
            checkpoint,
            guidanceQuestions: questionsForToken,
            coverageGaps: gapsForToken,
            coverageSummary: summaryForToken,
          },
        },
      )

      // ── Ephemeral token path: SDK handles WebSocket lifecycle ──
      if (tokenData?.ephemeralToken) {
        logger.info('[Voice] Ephemeral token received, connecting via SDK', {
          model: tokenData.model,
          mode: tokenData.sessionConfig.mode,
          tokenPrefix: tokenData.ephemeralToken.slice(0, 15) + '...',
        })

        const { GoogleGenAI, Modality, ActivityHandling, TurnCoverage } = await import('@google/genai')
        const ai = new GoogleGenAI({
          apiKey: tokenData.ephemeralToken,
          httpOptions: { apiVersion: 'v1alpha' },
        })

        const config = tokenData.sessionConfig
        const systemText = config.mode === 'guided_checkpoint'
          ? buildGuidedCheckpointInstruction(config)
          : `Sos un médico residente de AutaMedica haciendo una anamnesis por voz. Paciente: ${config.patient.name ?? 'sin nombre'}. Seguí 8 bloques: motivo, enfermedad actual, antecedentes, medicación, alergias, hábitos, revisión por sistemas, cierre. UNA pregunta por turno. Español argentino informal.`

        const session = await ai.live.connect({
          model: tokenData.model,
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: { parts: [{ text: systemText }] },
            inputAudioTranscription: {},
            realtimeInputConfig: {
              // We endpoint client-side, so Gemini expects explicit activityStart/activityEnd.
              automaticActivityDetection: { disabled: true },
              activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
              turnCoverage: TurnCoverage.TURN_INCLUDES_ONLY_ACTIVITY,
            },
          },
          callbacks: {
            onopen() {
              logger.info('[Voice] SDK Live session opened')
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onmessage(msg: any) {
              if (msg.serverContent?.modelTurn?.parts) {
                setModelTurns((prev) => prev + 1)
                const parts = msg.serverContent?.modelTurn?.parts ?? []
                for (const part of parts) {
                  if (part.functionCall?.name === 'complete_checkpoint') {
                    const summary = part.functionCall.args?.summary ?? 'Aclaración registrada.'
                    setSummaryText(summary)
                    stateRef.current = 'completed'
                    cleanup()
                    setState('completed')
                    return
                  }
                  if (part.inlineData?.data) playAudio(base64ToFloat32(part.inlineData.data))
                  if (part.text) {
                    const normalizedText = part.text.replace(LIVE_COMPLETION_TAG, '').trim()
                    if (normalizedText) addEntry('assistant', normalizedText)
                    if (part.text.includes(LIVE_COMPLETION_TAG)) {
                      setSummaryText(normalizedText)
                      stateRef.current = 'completed'
                      cleanup()
                      setState('completed')
                      return
                    }
                  }
                }
              }
              const transcriptText = getTranscriptionText(msg.serverContent?.inputTranscription)
              if (transcriptText) {
                addEntry('user', transcriptText)
              }
            },
            onerror(err: unknown) {
              const errDetail = err instanceof Error
                ? { message: err.message, name: err.name, stack: err.stack?.split('\n').slice(0, 3).join(' | ') }
                : err
              logger.error('[Voice] SDK Live session error', errDetail)
              setError('La sesión de voz se interrumpió.')
              cleanup()
              setState('idle')
              setMode(null)
              setStarted(false)
            },
            onclose(ev: unknown) {
              const closeEv = ev as { code?: number; reason?: string } | undefined
              logger.warn('[Voice] SDK Live session closed', {
                code: closeEv?.code,
                reason: closeEv?.reason,
                wasCompleted: stateRef.current === 'completed',
              })
              if (stateRef.current !== 'completed') {
                setMode(null)
                setStarted(false)
                setState('idle')
              }
            },
          },
        })

        // Store session for sending audio
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(wsRef as unknown as { current: unknown }).current = session

        // Step 4: Audio pipeline with SDK
        const ctx = new AudioContext({ sampleRate: 16000 })
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)

        await ctx.audioWorklet.addModule('/vad-processor.js')
        const vadNode = new AudioWorkletNode(ctx, 'vad-processor')

        vadNode.port.onmessage = (event: MessageEvent<{ rms: number; buffer: Float32Array }>) => {
          const { rms, buffer: inputData } = event.data
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const liveSession = wsRef.current as any
          const isAssistantPlaying = activeSourcesRef.current.size > 0
          const isPlaybackCoolingDown = Date.now() < playbackGuardUntilRef.current
          if (isAssistantPlaying || isPlaybackCoolingDown) {
            vadActiveRef.current = false
            return
          }
          const isSpeaking = rms > vadThreshold

          if (isSpeaking) {
            lastAudioTimeRef.current = Date.now()
            if (!vadActiveRef.current) {
              vadActiveRef.current = true
              stopAllAudio()
              if (liveSession?.sendRealtimeInput) {
                liveSession.sendRealtimeInput({ activityStart: {} })
              }
            }
          } else if (vadActiveRef.current && Date.now() - lastAudioTimeRef.current > 800) {
            // User stopped speaking — close the manual VAD turn so Gemini can respond.
            vadActiveRef.current = false
            if (liveSession?.sendRealtimeInput) {
              liveSession.sendRealtimeInput({ activityEnd: {} })
            }
          }

          if ((isSpeaking || vadActiveRef.current) && liveSession?.sendRealtimeInput) {
            const resampled = resample(inputData, ctx.sampleRate, 16000)
            liveSession.sendRealtimeInput({ audio: { data: float32ToBase64Pcm16(resampled), mimeType: 'audio/pcm;rate=16000' } })
          }
        }

        source.connect(vadNode)
        vadNode.connect(ctx.destination)

        // Gemini Live (constrained) does not accept clientContent — only realtimeInput audio.
        // The model will speak first after hearing the patient's mic input.
        // We add a UI prompt so the patient knows to start talking.
        addEntry('assistant', 'Hola, soy el asistente de AutaMedica. Contame, ¿en qué puedo ayudarte?')

        setMode('live')
        setStarted(true)
        setState('live')
        logger.info('[Voice] SDK Gemini Live connected — ephemeral token')
        return
      }

      // ── Legacy worker proxy path (fallback if no ephemeral token) ──
      if (!tokenData?.wsUrl) throw new Error('No wsUrl and no ephemeralToken')

      // Step 3: Connect WebSocket
      const ws = new WebSocket(tokenData.wsUrl)
      wsRef.current = ws

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 8000)

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'session_config', data: tokenData.sessionConfig }))
        }
        ws.onmessage = async (event) => {
          try {
            let textData = event.data;
            if (textData instanceof Blob) {
              textData = await textData.text();
            } else if (textData instanceof ArrayBuffer) {
              textData = new TextDecoder().decode(textData);
            }
            const msg = JSON.parse(textData)
            if (msg.type === 'connected') { clearTimeout(timeout); resolve(); return }
            if (msg.type === 'error') { clearTimeout(timeout); reject(new Error(msg.data || 'WS error')); return }
          } catch { /* ignore parse errors during setup */ }
        }
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')) }
      })

      // Step 4: WS connected — setup audio pipeline
      // `ctx` was already synchronously created/resumed at the top of this function
      if (!ctx) throw new Error('AudioContext not initialized')
      const audioCtx = ctx
      const source = audioCtx.createMediaStreamSource(stream)
      
      await audioCtx.audioWorklet.addModule('/vad-processor.js')
      const vadNode = new AudioWorkletNode(audioCtx, 'vad-processor')

      vadNode.port.onmessage = (event: MessageEvent<{ rms: number; buffer: Float32Array }>) => {
        const { rms, buffer: inputData } = event.data

        // ── Anti-feedback: suppress VAD while Gemini audio is playing ──
        // Without this, the mic picks up speaker output → VAD fires →
        // sends Gemini's own voice back → Gemini interprets as barge-in → stops talking.
        const isGeminiPlaying = activeSourcesRef.current.size > 0
        const isPlaybackCoolingDown = Date.now() < playbackGuardUntilRef.current
        if (isGeminiPlaying || isPlaybackCoolingDown) {
          // Don't process mic input while assistant is speaking.
          // User must wait for Gemini to finish, or the barge-in threshold
          // needs to be much higher (handled below).
          vadActiveRef.current = false
          return
        }

        const isSpeaking = rms > vadThreshold

        if (isSpeaking) {
          lastAudioTimeRef.current = Date.now()
          if (!vadActiveRef.current) {
            vadActiveRef.current = true
            stopAllAudio()
          }
        } else if (vadActiveRef.current && Date.now() - lastAudioTimeRef.current > 1000) {
          vadActiveRef.current = false
        }

        if (wsRef.current?.readyState === WebSocket.OPEN && (isSpeaking || vadActiveRef.current)) {
          const resampled = resample(inputData, audioCtx.sampleRate, 16000)
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: float32ToBase64Pcm16(resampled)
              }
            },
          }))
        }
      }
      
      // ── AGGRESSIVE audio processing chain ──
      // ONLY human speech (300Hz–3kHz) passes. Everything else gets crushed.

      // 1. Steep high-pass 300Hz — kills ALL low-frequency noise
      //    Fans, AC, traffic, footsteps, room resonance = gone
      const highpass = audioCtx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 300
      highpass.Q.value = 1.0

      // 2. Second high-pass 300Hz (cascaded = steeper slope, -24dB/oct)
      const highpass2 = audioCtx.createBiquadFilter()
      highpass2.type = 'highpass'
      highpass2.frequency.value = 300
      highpass2.Q.value = 0.7

      // 3. Steep low-pass 3kHz — kills clicks, hiss, keyboard, mouse
      const lowpass = audioCtx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 3000
      lowpass.Q.value = 1.0

      // 4. Second low-pass 3kHz (cascaded = -24dB/oct)
      const lowpass2 = audioCtx.createBiquadFilter()
      lowpass2.type = 'lowpass'
      lowpass2.frequency.value = 3000
      lowpass2.Q.value = 0.7

      // 5. EQ: Narrow voice boost at 1kHz (+6dB, Q=2)
      //    Makes speech stand out clearly above any residual noise
      const voiceBoost = audioCtx.createBiquadFilter()
      voiceBoost.type = 'peaking'
      voiceBoost.frequency.value = 1000
      voiceBoost.Q.value = 2.0
      voiceBoost.gain.value = 6

      // 6. EQ: Notch at 2.5kHz (-8dB) — where keyboard clicks live
      const clickNotch = audioCtx.createBiquadFilter()
      clickNotch.type = 'peaking'
      clickNotch.frequency.value = 2500
      clickNotch.Q.value = 3.0
      clickNotch.gain.value = -8

      // 7. Hard compressor — ratio 12:1 acts as a limiter
      //    Crushes sudden noises (cough, door, object falling)
      const compressor = audioCtx.createDynamicsCompressor()
      compressor.threshold.value = -20
      compressor.knee.value = 5
      compressor.ratio.value = 12
      compressor.attack.value = 0.001
      compressor.release.value = 0.1

      // 8. Noise gate via gain — silence anything below threshold
      //    The VAD already gates, but this pre-gates the signal
      const gateGain = audioCtx.createGain()
      gateGain.gain.value = 2.5

      // Chain: source → 2x highpass → 2x lowpass → voice boost → click notch → compressor → gate/gain → VAD
      source.connect(highpass)
      highpass.connect(highpass2)
      highpass2.connect(lowpass)
      lowpass.connect(lowpass2)
      lowpass2.connect(voiceBoost)
      voiceBoost.connect(clickNotch)
      clickNotch.connect(compressor)
      compressor.connect(gateGain)
      gateGain.connect(vadNode)
      vadNode.connect(audioCtx.destination)

      // Step 5: Handle Gemini Live responses
      ws.onmessage = async (event) => {
        try {
          // Gemini may send ArrayBuffer/Blob via Cloudflare DO relay — decode to string
          let raw: string
          if (typeof event.data === 'string') {
            raw = event.data
          } else if (event.data instanceof Blob) {
            raw = await event.data.text()
          } else if (event.data instanceof ArrayBuffer) {
            raw = new TextDecoder().decode(event.data)
          } else {
            logger.warn('[Voice] Unknown WS message type', typeof event.data)
            return
          }

          const msg = JSON.parse(raw) as {
            type?: string
            data?: unknown
            serverContent?: {
              modelTurn?: { parts?: Array<{ inlineData?: { data?: string }; text?: string; functionCall?: { name: string; args?: unknown } }> }
              inputTranscription?: string
            }
          }

          if (msg.type === 'error') {
            logger.warn('[Voice] Live session error', msg.data)
            setError('La sesión de voz se interrumpió. Podés pasar a texto.')
            stateRef.current = 'idle'
            cleanup()
            setMode(null)
            setStarted(false)
            setState('idle')
            return
          }
          if (msg.type === 'session-end') { finishRef.current(); return }

          if (msg.serverContent?.modelTurn?.parts) {
            setModelTurns((prev) => prev + 1)
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.functionCall?.name === 'complete_checkpoint') {
                const args = part.functionCall.args as Record<string, string> | undefined
                const summary = args?.summary ?? 'Aclaración registrada.'
                setSummaryText(summary)
                stateRef.current = 'completed'
                cleanup()
                setState('completed')
                return
              }
              if (part.inlineData?.data) playAudio(base64ToFloat32(part.inlineData.data))
              if (part.text) {
                const normalizedText = part.text.replace(LIVE_COMPLETION_TAG, '').trim()
                if (normalizedText) {
                  addEntry('assistant', normalizedText)
                }
                if (part.text.includes(LIVE_COMPLETION_TAG)) {
                  setSummaryText(normalizedText)
                  stateRef.current = 'completed'
                  cleanup()
                  setState('completed')
                  return
                }
              }
            }
          }
          if (msg.serverContent?.inputTranscription) {
            addEntry('user', msg.serverContent.inputTranscription)
          }
        } catch { /* ignore */ }
      }
      ws.onclose = () => {
        if (stateRef.current !== 'completed') {
          setMode(null)
          setStarted(false)
          setState('idle')
        }
      }

      setMode('live')
      setStarted(true)
      setState('live')
      logger.info('[Voice] Gemini Live connected — real-time audio active')

      // Nudge: send a realtimeInput.text to trigger Gemini's first response.
      // The system instruction tells Gemini to greet the patient and ask the first question.
      // After this, the mic audio stream takes over via VAD → realtimeInput.audio.
      ws.send(JSON.stringify({
        realtimeInput: { text: 'Hola, estoy listo para la anamnesis.' },
      }))
      logger.info('[Voice] Sent initial text nudge to trigger Gemini first turn')
    } catch (err) {
      // Capture detailed error info — SDK errors can be opaque
      const errorDetail = {
        message: err instanceof Error ? err.message : String(err),
        name: err instanceof Error ? err.name : typeof err,
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 4).join(' | ') : undefined,
        raw: JSON.stringify(err, Object.getOwnPropertyNames(err instanceof Error ? err : {})),
        cause: (err as { cause?: unknown })?.cause,
        status: (err as { status?: number })?.status,
        statusText: (err as { statusText?: string })?.statusText,
      }
      logger.error('[Voice] Live mode failed — detailed error:', errorDetail)
      logger.warn('[Voice] Falling back to relay mode')
      // Stop mic tracks — relay will use STT instead
      stream.getTracks().forEach(t => t.stop())
      mediaStreamRef.current = null
      wsRef.current = null
      await startRelayModeRef.current()
    }
  }, [
    addEntry,
    checkpoint,
    cleanup,
    coverageSummary,
    forceRelay,
    playAudio,
    stopAllAudio,
    vadThreshold,
  ])

  useEffect(() => {
    if (!isGuidedCheckpoint || started || autoStartAttemptedRef.current) return
    autoStartAttemptedRef.current = true
    void start()
  }, [isGuidedCheckpoint, started, start])

  // ── TTS (relay mode only) ──
  const speakTTS = useCallback((text: string, autoListen = true) => {
    if (!('speechSynthesis' in window)) {
      if (autoListen) startSTTRef.current()
      else setState('idle')
      return
    }

    const segments = segmentForTTS(text)
    if (segments.length === 0) {
      if (autoListen) startSTTRef.current()
      else setState('idle')
      return
    }

    stopTTS()
    setState('speaking')
    const synthesis = window.speechSynthesis
    const sessionId = ttsSessionRef.current
    const queue = [...segments]

    const finishSpeech = () => {
      clearTTSTimeout()
      if (autoListen) startSTTRef.current()
      else setState('idle')
    }

    const speakNext = () => {
      if (ttsSessionRef.current !== sessionId) return

      const nextSegment = queue.shift()
      if (!nextSegment) {
        finishSpeech()
        return
      }

      const utterance = new SpeechSynthesisUtterance(nextSegment)
      utterance.lang = 'es-AR'
      utterance.rate = 1.0
      utterance.onstart = () => {
        clearTTSTimeout()
        const watchdogMs = Math.max(6_000, Math.min(18_000, sanitizeForTTS(nextSegment).length * 90))
        ttsTimeoutRef.current = window.setTimeout(() => {
          if (ttsSessionRef.current !== sessionId) return
          logger.warn('[Voice] TTS watchdog fired; falling back to next step', { nextSegment })
          synthesis.cancel()
          finishSpeech()
        }, watchdogMs)
      }
      utterance.onend = () => {
        clearTTSTimeout()
        window.setTimeout(speakNext, 60)
      }
      utterance.onerror = () => {
        logger.warn('[Voice] TTS utterance failed', { nextSegment })
        finishSpeech()
      }

      synthesis.speak(utterance)
      synthesis.resume()
    }

    speakNext()
  }, [clearTTSTimeout, stopTTS])

  // ══════════════════════════════════════════════
  // RELAY MODE (fallback)
  // ══════════════════════════════════════════════
  const startRelayMode = useCallback(async () => {
    setState('processing')
    try {
      // Read guidance directly from prop to avoid stale ref race
      const questionsForRelay = guidance?.questions?.map((q) => q.text) ?? guidanceQuestions.current
      const gapsForRelay = guidance?.gaps ?? coverageGaps.current
      const summaryForRelay = guidance?.coverageSummary ?? coverageSummary
      logger.info('[Voice] startRelayMode — guidance context', {
        hasGuidanceProp: !!guidance,
        questionsFromProp: guidance?.questions?.length ?? 0,
        questionsFromRef: guidanceQuestions.current.length,
        questionsForRelay: questionsForRelay.length,
        gapsForRelay: gapsForRelay.length,
        checkpoint,
      })

      const result = await fetchApi<RelayResponse>(
        '/api/patients/anamnesis/live-relay',
        {
          method: 'POST',
          body: {
            text: '',
            patientContext: true,
            checkpoint,
            guidanceQuestions: questionsForRelay,
            coverageGaps: gapsForRelay,
            coverageSummary: summaryForRelay,
          },
        },
      )
      if (!result?.text) throw new Error('No response')
      setMode('relay')
      setStarted(true)
      setRelayOpeningTurnCount(1)
      setModelTurns(result.modelTurnCount ?? 1)
      setRelayHistory(result.history ?? [])
      addEntry('assistant', result.text)
      speakTTS(result.text, true)
    } catch (err) {
      logger.error('[Voice] Relay start failed', err)
      setError('No se pudo conectar con el asistente')
      setState('idle')
    }
  }, [addEntry, checkpoint, coverageSummary, guidance, speakTTS])

  useEffect(() => {
    startRelayModeRef.current = startRelayMode
  }, [startRelayMode])

  // ── Send to relay ──
  const sendRelayMessage = useCallback(async (text: string) => {
    if (!text.trim()) return
    recognitionRef.current?.stop()
    recognitionRef.current = null
    stopTTS()

    addEntry('user', text.trim())
    setCurrentInput('')
    setState('processing')

    try {
      const result = await fetchApi<RelayResponse>(
        '/api/patients/anamnesis/live-relay',
        {
          method: 'POST',
          body: {
            text: text.trim(),
            history: relayHistory,
            checkpoint,
            openingPromptSent: relayOpeningTurnCount > 0,
            guidanceQuestions: guidanceQuestions.current,
            coverageGaps: coverageGaps.current,
            coverageSummary,
          },
        },
      )
      if (!result?.text) throw new Error('No response')

      setRelayHistory(result.history)
      setModelTurns(result.modelTurnCount)
      addEntry('assistant', result.text)

      if (result.isComplete) {
        setSummaryText(result.text)
        if (result.extractedFields) setExtractedFields(result.extractedFields)
        speakTTS(result.text, false)
        setState('completed')
        return
      }
      speakTTS(result.text, true)
    } catch {
      setError('No se pudo enviar. Intentá de nuevo.')
      setState('idle')
    }
  }, [addEntry, checkpoint, coverageSummary, relayHistory, relayOpeningTurnCount, speakTTS, stopTTS])

  // ── STT (relay mode only) — auto-sends when patient stops ──
  const startSTT = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) { setState('idle'); return }

    const r = new SR()
    r.lang = 'es-AR'
    r.continuous = false
    r.interimResults = true
    recognitionRef.current = r

    let finalText = ''
    r.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript
        else interim = e.results[i][0].transcript
      }
      setCurrentInput(finalText || interim)
      currentInputRef.current = finalText || interim
    }
    r.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') logger.warn('[Voice] STT error', e.error)
      setState('idle')
    }
    r.onend = () => {
      const input = (finalText || currentInputRef.current).trim()
      if (input) sendRelayMessage(input)
      else setState('idle')
    }
    r.start()
    setState('listening')
  }, [sendRelayMessage])

  useEffect(() => {
    startSTTRef.current = startSTT
  }, [startSTT])

  // ── Finish ──
  const finish = useCallback(() => {
    stateRef.current = 'completed'
    cleanup()
    const entries = transcriptRef.current
    onDataExtracted({
      chiefComplaint: entries.find(e => e.role === 'user')?.text ?? '',
      transcript: entries,
      detectedSections: [],
      extractedFields: extractedFields ?? undefined,
    })
  }, [cleanup, onDataExtracted, extractedFields])

  useEffect(() => {
    finishRef.current = finish
  }, [finish])

  const earlyExit = useCallback(() => { cleanup(); onSwitchToText() }, [cleanup, onSwitchToText])

  const isLive = mode === 'live'
  const expectedModelTurns = isGuidedCheckpoint ? 4 : TOTAL_BLOCKS
  const progress = Math.min(Math.round((modelTurns / expectedModelTurns) * 100), 100)

  // ══════════ COMPLETED ══════════
  if (state === 'completed') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            <CheckCircle2 className="h-8 w-8 text-sky-600" />
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-2">Anamnesis completada</h3>
          <p className="text-sm text-stone-500 mb-4">Tus respuestas fueron registradas.</p>
          {summaryText && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 text-left text-sm text-stone-700 mb-4">{summaryText}</div>
          )}
          <button onClick={finish} className="w-full rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-700">
            Guardar y volver
          </button>
        </div>
      </div>
    )
  }

  // ══════════ PRE-START ══════════
  if (!started) {
    const showRetry = isGuidedCheckpoint && state !== 'connecting'
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            {state === 'connecting'
              ? <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
              : <Mic className="h-8 w-8 text-sky-600" />}
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-2">
            {isGuidedCheckpoint ? 'Preparando voz' : 'Anamnesis por voz'}
          </h3>
          <p className="text-sm text-stone-500 mb-5">
            {isGuidedCheckpoint
              ? 'Te vamos a hacer preguntas puntuales sobre lo pendiente y registrar tus respuestas por voz.'
              : 'Hablá naturalmente. El asistente te hace ~8 preguntas y cierra solo.'}
          </p>
          {isGuidedCheckpoint ? (
            <div className="space-y-3">
              <p className="text-xs text-stone-400">
                {state === 'connecting'
                  ? 'Activando micrófono y conexión...'
                  : 'Si algo falla, podés volver a intentarlo.'}
              </p>
              {showRetry && (
                <button
                  onClick={start}
                  className="mx-auto flex items-center gap-2 rounded-full bg-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-sky-700 disabled:opacity-50"
                >
                  <Mic className="h-4 w-4" />
                  Reintentar
                </button>
              )}
            </div>
          ) : (
            <button onClick={start} disabled={state === 'connecting'} className="mx-auto flex items-center gap-2 rounded-full bg-sky-600 px-8 py-4 text-base font-semibold text-white shadow-lg hover:bg-sky-700 disabled:opacity-50">
              {state === 'connecting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
              Iniciar
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={onSwitchToText} className="w-full text-center text-sm text-stone-400 underline hover:text-stone-600">
          <ArrowLeft className="inline h-3 w-3 mr-1" />Volver
        </button>
      </div>
    )
  }

  // ══════════ LIVE MODE (Gemini 3.1 Flash Live) ══════════
  if (isLive) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-2 text-xs text-sky-600">
          <span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />
          {isGuidedCheckpoint ? 'Aclaración guiada en tiempo real' : 'Audio en tiempo real'}
        </div>

        {isGuidedCheckpoint && (
          <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-sm text-sky-900">
            Te voy a pedir solo las aclaraciones pendientes. Cuando termines, podés guardar lo hablado.
          </div>
        )}

        {/* Transcript */}
        <div className="space-y-3 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
          {transcript.map((entry, i) => (
            <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                entry.role === 'user' ? 'bg-sky-500 text-white' : 'bg-stone-100 text-stone-800'
              }`}>{entry.text}</div>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Live indicator and VAD Slider */}
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="h-20 w-20 rounded-full bg-sky-500 flex items-center justify-center animate-pulse shadow-lg shadow-sky-200">
            <Mic className="h-10 w-10 text-white" />
          </div>
          <p className="text-sm text-stone-500">
            {isGuidedCheckpoint
              ? 'Respondé en voz alta. Te guiamos con preguntas puntuales.'
              : 'Hablá libremente. Te escuchamos en tiempo real.'}
          </p>
          <div className="w-full max-w-xs space-y-1">
            <div className="flex justify-between text-xs text-stone-400">
              <span>Sensibilidad del micrófono</span>
              <span>{Math.round(vadThreshold * 1000)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="0.1"
              step="0.001"
              value={vadThreshold}
              onChange={(e) => setVadThreshold(parseFloat(e.target.value))}
              className="w-full accent-sky-500"
            />
            <p className="text-xs text-stone-400 text-center">Ajustá para filtrar ruido ambiente si se interrumpe solo</p>
          </div>
        </div>

        <div className="flex justify-center gap-3">
          {isGuidedCheckpoint && transcript.length > 0 && (
            <button
              onClick={() => {
                stateRef.current = 'completed'
                cleanup()
                setSummaryText(
                  transcript
                    .filter((entry) => entry.role === 'assistant')
                    .slice(-1)[0]?.text ?? 'Aclaración registrada.',
                )
                setState('completed')
              }}
              className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
            >
              Guardar y volver
            </button>
          )}
          <button onClick={earlyExit} className="text-xs text-stone-400 hover:text-stone-600">Salir</button>
        </div>
      </div>
    )
  }

  // ══════════ RELAY MODE (fallback) ══════════
  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span>Pregunta {Math.min(modelTurns, expectedModelTurns)} de ~{expectedModelTurns}</span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-stone-100">
          <div className="h-1.5 rounded-full bg-sky-500 transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Chat */}
      <div className="space-y-3 max-h-72 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
        {transcript.map((entry, i) => (
          <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              entry.role === 'user' ? 'bg-sky-500 text-white' : 'bg-stone-100 text-stone-800'
            }`}>{entry.text}</div>
          </div>
        ))}
        {state === 'processing' && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-stone-100 px-4 py-2.5"><Loader2 className="h-4 w-4 animate-spin text-stone-400" /></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {currentInput && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
          <p className="text-sm text-sky-700 italic">{currentInput}</p>
        </div>
      )}

      {/* Status indicator */}
      <div className="flex flex-col items-center gap-2 py-2">
        <div className={`h-14 w-14 rounded-full flex items-center justify-center transition-all ${
          state === 'listening' ? 'bg-red-500 animate-pulse shadow-lg shadow-red-200'
          : state === 'speaking' ? 'bg-sky-400 animate-pulse'
          : 'bg-stone-200'
        }`}>
          <Mic className="h-7 w-7 text-white" />
        </div>
        <p className="text-xs text-stone-400">
          {state === 'listening' && 'Escuchando...'}
          {state === 'processing' && 'Procesando...'}
          {state === 'speaking' && 'Respondiendo...'}
          {state === 'idle' && 'Esperando...'}
        </p>
      </div>

      <div className="flex justify-center">
        <button onClick={earlyExit} className="text-xs text-stone-400 hover:text-stone-600">Salir</button>
      </div>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
    </div>
  )
}
