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
  }
  guidanceQuestions: string[]
  coverageGaps: string[]
  coverageSummary?: string
  maxModelTurns: number
}

interface LiveTokenResponse {
  wsUrl: string
  sessionId: string
  model: string
  sessionConfig: LiveSessionConfig
}

const TOTAL_BLOCKS = 8
const LIVE_COMPLETION_TAG = '[CHECKPOINT_COMPLETO]'

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
  const [vadThreshold, setVadThreshold] = useState(0.02)

  const vadActiveRef = useRef(false)
  const lastAudioTimeRef = useRef<number>(0)
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set())
  const audioQueueTimeRef = useRef<number>(0)

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

  const addEntry = useCallback((role: 'user' | 'assistant', text: string) => {
    setTranscript(prev => [...prev, { role, text, timestamp: Date.now() }])
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
    }
  }, [])

  // ══════════════════════════════════════════════
  // START — Try Gemini Live first, fallback to relay
  // ══════════════════════════════════════════════
  const start = useCallback(async () => {
    setState('connecting')
    setError(null)

    if (forceRelay) {
      await startRelayModeRef.current()
      return
    }

    // Step 1: Request mic BEFORE connecting WebSocket
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
      })
      mediaStreamRef.current = stream
    } catch {
      logger.warn('[Voice] Mic denied, falling back to relay')
      await startRelayModeRef.current()
      return
    }

    // Step 2: Get WS URL
    try {
      const tokenData = await fetchApi<LiveTokenResponse>(
        '/api/patients/anamnesis/live-token',
        {
          method: 'POST',
          body: {
            checkpoint,
            guidanceQuestions: guidanceQuestions.current,
            coverageGaps: coverageGaps.current,
            coverageSummary,
          },
        },
      )
      if (!tokenData?.wsUrl) throw new Error('No wsUrl')

      // Step 3: Connect WebSocket
      const ws = new WebSocket(tokenData.wsUrl)
      wsRef.current = ws

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { ws.close(); reject(new Error('timeout')) }, 8000)

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: 'session_config', data: tokenData.sessionConfig }))
        }
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'connected') { clearTimeout(timeout); resolve(); return }
            if (msg.type === 'error') { clearTimeout(timeout); reject(new Error(msg.data || 'WS error')); return }
          } catch { /* ignore parse errors during setup */ }
        }
        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')) }
      })

      // Step 4: WS connected — setup audio pipeline
      const ctx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        
        // Calculate RMS to determine voice activity
        let sumSquares = 0
        for (let i = 0; i < inputData.length; i++) {
          sumSquares += inputData[i] * inputData[i]
        }
        const rms = Math.sqrt(sumSquares / inputData.length)
        const isSpeaking = rms > vadThreshold

        if (isSpeaking) {
          lastAudioTimeRef.current = Date.now()
          if (!vadActiveRef.current) {
            vadActiveRef.current = true
            // Real barge-in: stop assistant when user speaks
            stopAllAudio()
          }
        } else if (vadActiveRef.current && Date.now() - lastAudioTimeRef.current > 1000) {
          // Keep sending for 1 sec after voice stops
          vadActiveRef.current = false
        }

        if (wsRef.current?.readyState === WebSocket.OPEN && (isSpeaking || vadActiveRef.current)) {
          const resampled = resample(inputData, ctx.sampleRate, 16000)
          wsRef.current.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ data: float32ToBase64Pcm16(resampled), mimeType: 'audio/pcm;rate=16000' }],
            },
          }))
        }
      }
      source.connect(processor)
      processor.connect(ctx.destination)

      // Step 5: Handle Gemini Live responses
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
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
    } catch (err) {
      logger.warn('[Voice] Live mode failed, falling back to relay', err)
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

  // ══════════════════════════════════════════════
  // RELAY MODE (fallback)
  // ══════════════════════════════════════════════
  const startRelayMode = useCallback(async () => {
    setState('processing')
    try {
      const result = await fetchApi<RelayResponse>(
        '/api/patients/anamnesis/live-relay',
        {
          method: 'POST',
          body: {
            text: '',
            patientContext: true,
            checkpoint,
            guidanceQuestions: guidanceQuestions.current,
            coverageGaps: coverageGaps.current,
            coverageSummary,
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
  }, [addEntry, checkpoint, coverageSummary, speakTTS])

  useEffect(() => {
    startRelayModeRef.current = startRelayMode
  }, [startRelayMode])

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

  // ── STT (relay mode only) — auto-sends when patient stops ──
  const startSTT = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setState('idle'); return }

    const r = new SR()
    r.lang = 'es-AR'
    r.continuous = false
    r.interimResults = true
    recognitionRef.current = r

    let finalText = ''
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript
        else interim = e.results[i][0].transcript
      }
      setCurrentInput(finalText || interim)
      currentInputRef.current = finalText || interim
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => {
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
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            <Mic className="h-8 w-8 text-sky-600" />
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-2">Anamnesis por voz</h3>
          <p className="text-sm text-stone-500 mb-5">
            {isGuidedCheckpoint
              ? 'Gemini te va a hacer preguntas puntuales sobre los datos que faltan y va a registrar tus respuestas por voz.'
              : 'Hablá naturalmente. El asistente te hace ~8 preguntas y cierra solo.'}
          </p>
          <button onClick={start} disabled={state === 'connecting'} className="mx-auto flex items-center gap-2 rounded-full bg-sky-600 px-8 py-4 text-base font-semibold text-white shadow-lg hover:bg-sky-700 disabled:opacity-50">
            {state === 'connecting' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            Iniciar
          </button>
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
          {isGuidedCheckpoint ? 'Gemini Live — aclaración guiada en tiempo real' : 'Gemini Live — audio en tiempo real'}
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
              ? 'Respondé en voz alta. Gemini te escucha y te va guiando con preguntas puntuales.'
              : 'Hablá libremente — Gemini te escucha en tiempo real'}
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
