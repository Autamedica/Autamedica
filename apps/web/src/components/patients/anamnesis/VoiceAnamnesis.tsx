'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2, Send, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { sanitizeForTTS } from '@/lib/patients/utils/tts-sanitizer'
import { logger } from '@autamedica/shared'

interface VoiceAnamnesisProps {
  onDataExtracted: (data: {
    chiefComplaint: string
    transcript: TranscriptEntry[]
    detectedSections: string[]
    extractedFields?: Record<string, string>
  }) => void
  onSwitchToText: () => void
  existingSections?: string[]
}

interface TranscriptEntry {
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'completed'

interface RelayResponse {
  text: string
  history: Array<{ role: 'user' | 'model'; text: string }>
  isComplete: boolean
  turnCount: number
  modelTurnCount: number
  extractedFields?: Record<string, string>
}

const TOTAL_BLOCKS = 8

export function VoiceAnamnesis({ onDataExtracted, onSwitchToText }: VoiceAnamnesisProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [relayHistory, setRelayHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([])
  const [currentInput, setCurrentInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)
  const [modelTurns, setModelTurns] = useState(0)
  const [extractedFields, setExtractedFields] = useState<Record<string, string> | null>(null)
  const [summaryText, setSummaryText] = useState('')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript])
  useEffect(() => { return () => { recognitionRef.current?.abort(); window.speechSynthesis?.cancel() } }, [])

  const addEntry = useCallback((role: 'user' | 'assistant', text: string) => {
    setTranscript(prev => [...prev, { role, text, timestamp: Date.now() }])
  }, [])

  // ── TTS with sanitization + auto-listen after ──
  const speak = useCallback((text: string, autoListenAfter = true) => {
    if (!('speechSynthesis' in window)) {
      setState('idle')
      return
    }
    setState('speaking')
    const sanitized = sanitizeForTTS(text)
    const u = new SpeechSynthesisUtterance(sanitized)
    u.lang = 'es-AR'
    u.rate = 1.0
    u.onend = () => {
      if (autoListenAfter) {
        startListening()
      } else {
        setState('idle')
      }
    }
    u.onerror = () => setState('idle')
    window.speechSynthesis.speak(u)
  }, [])

  // ── STT — auto-starts after TTS finishes ──
  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setState('idle')
      return
    }

    const recognition = new SR()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) text += e.results[i][0].transcript
      setCurrentInput(text)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') logger.warn('[Voice] STT error', e.error)
      setState('idle')
    }
    recognition.onend = () => {
      // Auto-send if there's text and we were listening
      const input = currentInput.trim()
      if (input) {
        sendMessage(input)
      } else {
        setState('idle')
      }
    }

    recognition.start()
    setState('listening')
  }, [currentInput])

  // ── Start conversation ──
  const start = useCallback(async () => {
    setState('connecting')
    setError(null)
    try {
      const result = await fetchApi<RelayResponse>(
        '/api/patients/anamnesis/live-relay',
        { method: 'POST', body: { text: '', patientContext: true } },
      )
      if (!result?.text) throw new Error('No response')
      setStarted(true)
      setModelTurns(1)
      addEntry('assistant', result.text)
      speak(result.text, true) // auto-listen after greeting
    } catch (err) {
      logger.error('[Voice] Start failed', err)
      setError('No se pudo conectar con el asistente')
      setState('idle')
    }
  }, [addEntry, speak])

  // ── Send message to relay ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return
    recognitionRef.current?.stop()
    recognitionRef.current = null
    window.speechSynthesis?.cancel()

    addEntry('user', text.trim())
    setCurrentInput('')
    setState('processing')

    try {
      const result = await fetchApi<RelayResponse>(
        '/api/patients/anamnesis/live-relay',
        { method: 'POST', body: { text: text.trim(), history: relayHistory } },
      )
      if (!result?.text) throw new Error('No response')

      setRelayHistory(result.history)
      setModelTurns(result.modelTurnCount)
      addEntry('assistant', result.text)

      if (result.isComplete) {
        // Auto-finish: show summary, persist data
        setSummaryText(result.text)
        if (result.extractedFields) setExtractedFields(result.extractedFields)
        speak(result.text, false) // don't auto-listen after final message
        setState('completed')
        return
      }

      speak(result.text, true) // auto-listen after AI speaks
    } catch (err) {
      logger.error('[Voice] Send failed', err)
      setError('No se pudo enviar. Intentá de nuevo.')
      setState('idle')
    }
  }, [relayHistory, speak, addEntry])

  // ── Manual send (text input) ──
  const handleManualSend = useCallback(() => {
    if (currentInput.trim()) {
      recognitionRef.current?.stop()
      recognitionRef.current = null
      sendMessage(currentInput)
    }
  }, [currentInput, sendMessage])

  // ── Stop listening and send ──
  const stopAndSend = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    if (currentInput.trim()) sendMessage(currentInput)
    else setState('idle')
  }, [currentInput, sendMessage])

  // ── Finish (called from completed state or early exit) ──
  const finish = useCallback(() => {
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
    const entries = transcriptRef.current
    onDataExtracted({
      chiefComplaint: entries.find(e => e.role === 'user')?.text ?? '',
      transcript: entries,
      detectedSections: [],
      extractedFields: extractedFields ?? undefined,
    })
  }, [onDataExtracted, extractedFields])

  // ── Early exit ──
  const earlyExit = useCallback(() => {
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
    onSwitchToText()
  }, [onSwitchToText])

  const isListening = state === 'listening'
  const progress = Math.min(Math.round((modelTurns / TOTAL_BLOCKS) * 100), 100)

  // ══════════ COMPLETED STATE ══════════
  if (state === 'completed') {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            <CheckCircle2 className="h-8 w-8 text-sky-600" />
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-2">Anamnesis completada</h3>
          <p className="text-sm text-stone-500 mb-4">Tus respuestas fueron registradas correctamente.</p>

          {summaryText && (
            <div className="rounded-xl border border-stone-200 bg-white p-4 text-left text-sm text-stone-700 mb-4">
              {summaryText}
            </div>
          )}

          <button
            onClick={finish}
            className="w-full rounded-xl bg-sky-600 px-6 py-3 text-sm font-semibold text-white hover:bg-sky-700"
          >
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
            El asistente te va a hacer ~8 preguntas sobre tu salud. Respondé naturalmente, como si hablaras con tu médico.
          </p>
          <button
            onClick={start}
            disabled={state === 'connecting'}
            className="mx-auto flex items-center gap-2 rounded-full bg-sky-600 px-8 py-4 text-base font-semibold text-white shadow-lg hover:bg-sky-700 disabled:opacity-50"
          >
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

  // ══════════ ACTIVE CONVERSATION ══════════
  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-stone-400">
          <span>Pregunta {modelTurns} de ~{TOTAL_BLOCKS}</span>
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
            }`}>
              {entry.text}
            </div>
          </div>
        ))}
        {state === 'processing' && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-stone-100 px-4 py-2.5"><Loader2 className="h-4 w-4 animate-spin text-stone-400" /></div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Live input preview */}
      {currentInput && (
        <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
          <p className="text-sm text-sky-700 italic">{currentInput}</p>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        <button
          onClick={isListening ? stopAndSend : startListening}
          disabled={state === 'processing' || state === 'speaking'}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all ${
            isListening ? 'bg-red-500 shadow-lg shadow-red-200 animate-pulse' : 'bg-sky-500 shadow-lg shadow-sky-200 hover:bg-sky-600'
          } disabled:opacity-40 disabled:animate-none`}
        >
          {isListening ? <MicOff className="h-6 w-6 text-white" />
            : state === 'processing' ? <Loader2 className="h-6 w-6 text-white animate-spin" />
            : <Mic className="h-6 w-6 text-white" />}
        </button>
        <input
          type="text"
          value={currentInput}
          onChange={e => setCurrentInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleManualSend() }}
          placeholder={isListening ? 'Escuchando...' : state === 'speaking' ? 'Respondiendo...' : 'O escribí tu respuesta'}
          disabled={state === 'processing' || state === 'speaking'}
          className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-3 text-sm focus:border-sky-400 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={handleManualSend}
          disabled={!currentInput.trim() || state === 'processing' || state === 'speaking'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">
          {state === 'listening' && 'Escuchando...'}
          {state === 'processing' && 'Procesando...'}
          {state === 'speaking' && 'Respondiendo...'}
          {state === 'idle' && 'Tocá el micrófono o escribí'}
        </p>
        <button onClick={earlyExit} className="text-xs text-stone-400 hover:text-stone-600">
          Salir
        </button>
      </div>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
    </div>
  )
}
