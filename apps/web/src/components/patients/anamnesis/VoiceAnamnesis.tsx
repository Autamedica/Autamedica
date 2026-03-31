'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2, Send, ArrowLeft } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { logger } from '@autamedica/shared'

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

type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking'
type ConnectionMode = 'live' | 'relay'

interface RelayResponse {
  text: string
  history: Array<{ role: 'user' | 'model'; text: string }>
  isComplete: boolean
  turnCount: number
}

const SECTION_KEYWORDS: Record<string, string[]> = {
  motivo_consulta: ['motivo', 'consulta', 'trae'],
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

function resample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer
  const ratio = fromRate / toRate
  const newLength = Math.round(buffer.length / ratio)
  const result = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) result[i] = buffer[Math.round(i * ratio)]
  return result
}

function float32ToBase64Pcm16(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const bytes = new Uint8Array(int16.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  const int16 = new Int16Array(bytes.buffer)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000
  return float32
}

export function VoiceAnamnesis({ onDataExtracted, onSwitchToText }: VoiceAnamnesisProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [mode, setMode] = useState<ConnectionMode | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [relayHistory, setRelayHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([])
  const [currentInput, setCurrentInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript])
  useEffect(() => { return () => cleanup() }, [])

  const cleanup = useCallback(() => {
    recognitionRef.current?.abort()
    mediaStreamRef.current?.getTracks().forEach((t: MediaStreamTrack) => t.stop())
    audioCtxRef.current?.close().catch(() => {})
    wsRef.current?.close()
    window.speechSynthesis?.cancel()
    wsRef.current = null
    audioCtxRef.current = null
    mediaStreamRef.current = null
  }, [])

  const addEntry = useCallback((role: 'user' | 'assistant', text: string) => {
    setTranscript(prev => [...prev, { role, text, timestamp: Date.now() }])
  }, [])

  const playAudio = useCallback((audioData: Float32Array) => {
    const ctx = audioCtxRef.current
    if (!ctx) return
    const buffer = ctx.createBuffer(1, audioData.length, 24000)
    buffer.getChannelData(0).set(audioData)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.start()
  }, [])

  // ══════════════ Gemini Live (WebSocket) ══════════════
  const startLiveMode = useCallback(async () => {
    setState('connecting')
    setError(null)

    try {
      const tokenData = await fetchApi<{ wsUrl: string; sessionId: string; model: string }>(
        '/api/patients/anamnesis/live-token',
      )
      if (!tokenData?.wsUrl) throw new Error('No wsUrl')

      const ws = new WebSocket(tokenData.wsUrl)
      wsRef.current = ws

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { ws.close(); reject(new Error('WS timeout')) }, 8000)

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'connected') { clearTimeout(timeout); resolve(); return }
            if (msg.type === 'error') { clearTimeout(timeout); reject(new Error(msg.data || 'WS error')); return }
            if (msg.type === 'session-end') { finish(); return }

            if (msg.serverContent?.modelTurn?.parts) {
              for (const part of msg.serverContent.modelTurn.parts) {
                if (part.inlineData?.data) playAudio(base64ToFloat32(part.inlineData.data))
                if (part.text) addEntry('assistant', part.text)
              }
            }
            if (msg.serverContent?.inputTranscription) addEntry('user', msg.serverContent.inputTranscription)
          } catch (err) { logger.warn('[Voice] WS parse error', err) }
        }

        ws.onerror = () => { clearTimeout(timeout); reject(new Error('WS error')) }
        ws.onclose = () => setState(prev => prev === 'connecting' ? prev : 'idle')
      })

      setMode('live')
      setStarted(true)
      addEntry('assistant', '¿Qué te trae hoy a la consulta?')

      // Start mic → Gemini
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true } })
      mediaStreamRef.current = stream
      const ctx = new AudioContext({ sampleRate: 16000 })
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const processor = ctx.createScriptProcessor(4096, 1, 1)
      processor.onaudioprocess = (e) => {
        const resampled = resample(e.inputBuffer.getChannelData(0), ctx.sampleRate, 16000)
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            realtimeInput: { mediaChunks: [{ data: float32ToBase64Pcm16(resampled), mimeType: 'audio/pcm;rate=16000' }] },
          }))
        }
      }
      source.connect(processor)
      processor.connect(ctx.destination)
      setState('listening')
    } catch (err) {
      logger.warn('[Voice] Live mode failed, falling back to relay', err)
      cleanup()
      await startRelayMode()
    }
  }, [addEntry, cleanup, playAudio])

  // ══════════════ HTTP Relay (fallback) ══════════════
  const startRelayMode = useCallback(async () => {
    setState('processing')
    setError(null)
    try {
      const result = await fetchApi<RelayResponse>('/api/patients/anamnesis/live-relay', { method: 'POST', body: { text: '' } })
      if (!result?.text) throw new Error('No response')
      setMode('relay')
      setStarted(true)
      addEntry('assistant', result.text)
      speak(result.text)
    } catch (err) {
      logger.error('[Voice] Relay start failed', err)
      setError('No se pudo conectar con el asistente')
      setState('idle')
    }
  }, [addEntry])

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) { setState('idle'); return }
    setState('speaking')
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'es-AR'
    u.rate = 1.05
    u.onend = () => setState('idle')
    u.onerror = () => setState('idle')
    window.speechSynthesis.speak(u)
  }, [])

  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setError('Tu navegador no soporta voz. Usá el campo de texto.'); return }
    const r = new SR()
    r.lang = 'es-AR'; r.continuous = true; r.interimResults = true
    recognitionRef.current = r
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onresult = (e: any) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript
      setCurrentInput(text)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    r.onerror = (e: any) => { if (e.error !== 'aborted') logger.warn('[Voice] STT error', e.error) }
    r.onend = () => setState(prev => prev === 'listening' ? 'idle' : prev)
    r.start()
    setState('listening')
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return
    recognitionRef.current?.stop(); window.speechSynthesis?.cancel()
    addEntry('user', text.trim())
    setCurrentInput('')
    setState('processing')
    try {
      const result = await fetchApi<RelayResponse>('/api/patients/anamnesis/live-relay', { method: 'POST', body: { text: text.trim(), history: relayHistory } })
      if (!result?.text) throw new Error('No response')
      setRelayHistory(result.history)
      addEntry('assistant', result.text)
      if (result.isComplete) { finish(); return }
      speak(result.text)
    } catch (err) {
      setError('No se pudo enviar. Intentá de nuevo.')
      setState('idle')
    }
  }, [relayHistory, speak, addEntry])

  const stopAndSend = useCallback(() => {
    recognitionRef.current?.stop()
    if (currentInput.trim()) sendMessage(currentInput)
    else setState('idle')
  }, [currentInput, sendMessage])

  const finish = useCallback(() => {
    cleanup()
    const entries = transcriptRef.current
    onDataExtracted({
      chiefComplaint: entries.find(e => e.role === 'user')?.text ?? '',
      transcript: entries,
      detectedSections: detectSections(entries.map(e => e.text).join(' ')),
    })
  }, [cleanup, onDataExtracted])

  const start = useCallback(() => startLiveMode(), [startLiveMode])
  const isListening = state === 'listening'
  const isLive = mode === 'live'

  if (!started) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            <Mic className="h-8 w-8 text-sky-600" />
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-2">Anamnesis por voz</h3>
          <p className="text-sm text-stone-500 mb-5">Hablá naturalmente con la IA de AutaMedica. Te va a hacer preguntas sobre tu salud como si fuera una consulta.</p>
          <button onClick={start} disabled={state === 'connecting' || state === 'processing'} className="mx-auto flex items-center gap-2 rounded-full bg-sky-600 px-8 py-4 text-base font-semibold text-white shadow-lg hover:bg-sky-700 disabled:opacity-50">
            {(state === 'connecting' || state === 'processing') ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            Iniciar conversación
          </button>
        </div>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={onSwitchToText} className="w-full text-center text-sm text-stone-400 underline hover:text-stone-600"><ArrowLeft className="inline h-3 w-3 mr-1" />Volver</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {isLive && <div className="flex items-center justify-center gap-2 text-xs text-sky-600"><span className="h-2 w-2 rounded-full bg-sky-500 animate-pulse" />Gemini Live — audio en tiempo real</div>}

      <div className="space-y-3 max-h-80 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
        {transcript.map((entry, i) => (
          <div key={i} className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${entry.role === 'user' ? 'bg-sky-500 text-white' : 'bg-stone-100 text-stone-800'}`}>{entry.text}</div>
          </div>
        ))}
        {state === 'processing' && <div className="flex justify-start"><div className="rounded-2xl bg-stone-100 px-4 py-2.5"><Loader2 className="h-4 w-4 animate-spin text-stone-400" /></div></div>}
        <div ref={chatEndRef} />
      </div>

      {currentInput && <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3"><p className="text-sm text-sky-700 italic">{currentInput}</p></div>}

      {!isLive && (
        <div className="flex items-center gap-3">
          <button onClick={isListening ? stopAndSend : startListening} disabled={state === 'processing' || state === 'speaking'} className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all ${isListening ? 'bg-red-500 shadow-lg shadow-red-200 animate-pulse' : 'bg-sky-500 shadow-lg shadow-sky-200 hover:bg-sky-600'} disabled:opacity-40 disabled:animate-none`}>
            {isListening ? <MicOff className="h-6 w-6 text-white" /> : state === 'processing' ? <Loader2 className="h-6 w-6 text-white animate-spin" /> : <Mic className="h-6 w-6 text-white" />}
          </button>
          <input type="text" value={currentInput} onChange={e => setCurrentInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && currentInput.trim()) sendMessage(currentInput) }} placeholder={isListening ? 'Escuchando...' : 'O escribí tu respuesta'} className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-3 text-sm focus:border-sky-400 focus:outline-none" />
          <button onClick={() => sendMessage(currentInput)} disabled={!currentInput.trim() || state === 'processing'} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white disabled:opacity-30"><Send className="h-4 w-4" /></button>
        </div>
      )}

      {isLive && <div className="flex items-center justify-center"><div className={`h-16 w-16 rounded-full flex items-center justify-center ${isListening ? 'bg-red-500 animate-pulse' : 'bg-sky-500'}`}><Mic className="h-8 w-8 text-white" /></div></div>}

      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">
          {state === 'listening' && (isLive ? 'Hablá libremente...' : 'Escuchando...')}
          {state === 'processing' && 'Procesando...'}
          {state === 'speaking' && 'Respondiendo...'}
          {state === 'idle' && !isLive && 'Tocá el micrófono para hablar'}
        </p>
        <button onClick={finish} className="text-xs font-medium text-sky-600 hover:text-sky-800">Finalizar</button>
      </div>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
      <button onClick={onSwitchToText} className="w-full text-center text-sm text-stone-400 underline hover:text-stone-600"><ArrowLeft className="inline h-3 w-3 mr-1" />Volver</button>
    </div>
  )
}
