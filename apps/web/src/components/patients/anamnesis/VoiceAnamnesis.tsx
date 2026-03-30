'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Mic, MicOff, Loader2, Send } from 'lucide-react'
import { logger } from '@autamedica/shared'
import { fetchApi } from '@/lib/api-client'

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

type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'responding'

// ─── Web Speech API types ────────────────────────────────────────────
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } }; length: number }
  resultIndex: number
}

interface SpeechRecognitionInstance {
  lang: string
  continuous: boolean
  interimResults: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

// ─── Section detection ───────────────────────────────────────────────
const SECTION_KEYWORDS: Record<string, string[]> = {
  motivo_consulta: ['motivo', 'consulta', 'por qué'],
  sintomas_actuales: ['síntoma', 'dolor', 'molestia', 'fiebre', 'mareo'],
  antecedentes_personales: ['antecedente', 'operación', 'cirugía', 'enfermedad'],
  medicacion_actual: ['medicamento', 'medicación', 'pastilla', 'remedio'],
  alergias: ['alergia', 'alérgico'],
  antecedentes_familiares: ['familia', 'padre', 'madre', 'hermano'],
  habitos: ['fumás', 'alcohol', 'ejercicio', 'droga'],
}

function detectSections(text: string): string[] {
  const lower = text.toLowerCase()
  return Object.entries(SECTION_KEYWORDS)
    .filter(([, keywords]) => keywords.some(k => lower.includes(k)))
    .map(([section]) => section)
}

// ─── Component ───────────────────────────────────────────────────────
export function VoiceAnamnesis({ onDataExtracted, onSwitchToText }: VoiceAnamnesisProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [aiMessage, setAiMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript, aiMessage])

  // Cleanup on unmount
  useEffect(() => {
    return () => { recognitionRef.current?.abort() }
  }, [])

  // ── Start session ──
  const startSession = useCallback(async () => {
    setState('connecting')
    setError(null)

    try {
      const result = await fetchApi<{ sessionId: string; greeting: string }>(
        '/api/patients/anamnesis/live-relay',
        { method: 'POST', body: { action: 'start' } },
      )

      if (!result?.sessionId) throw new Error('No se pudo iniciar la sesión')

      setSessionId(result.sessionId)
      setAiMessage(result.greeting)
      setTranscript([{ role: 'assistant', text: result.greeting, timestamp: Date.now() }])
      setState('idle')

      // Use TTS for greeting
      speak(result.greeting)
    } catch (err) {
      logger.error('[VoiceAnamnesis] Start failed', err)
      setError('No se pudo conectar con el asistente de voz')
      setState('idle')
    }
  }, [])

  // ── TTS (Web Speech Synthesis) ──
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    setState('responding')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-AR'
    utterance.rate = 1.05
    utterance.onend = () => setState('idle')
    utterance.onerror = () => setState('idle')
    window.speechSynthesis.speak(utterance)
  }, [])

  // ── Start listening (STT) ──
  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = window as any
    const SpeechRecognition = win.SpeechRecognition || win.webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError('Tu navegador no soporta reconocimiento de voz')
      return
    }

    const recognition = new (SpeechRecognition as new () => SpeechRecognitionInstance)()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        interim += e.results[i][0].transcript
      }
      setCurrentInput(interim)
    }

    recognition.onerror = (e) => {
      if (e.error !== 'aborted') {
        logger.warn('[VoiceAnamnesis] Speech recognition error', e.error)
      }
    }

    recognition.onend = () => {
      setState(prev => prev === 'listening' ? 'idle' : prev)
    }

    recognition.start()
    setState('listening')
  }, [])

  // ── Stop listening and send to AI ──
  const stopAndSend = useCallback(async () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null

    const text = currentInput.trim()
    if (!text || !sessionId) {
      setState('idle')
      return
    }

    // Add user message
    setTranscript(prev => [...prev, { role: 'user', text, timestamp: Date.now() }])
    setCurrentInput('')
    setState('processing')

    try {
      const result = await fetchApi<{ text: string; turnCount: number; isComplete: boolean }>(
        '/api/patients/anamnesis/live-relay',
        { method: 'POST', body: { action: 'message', sessionId, text } },
      )

      if (!result?.text) throw new Error('Sin respuesta del asistente')

      setTranscript(prev => [...prev, { role: 'assistant', text: result.text, timestamp: Date.now() }])
      setAiMessage(result.text)

      if (result.isComplete) {
        finishConversation()
        return
      }

      // Speak the response
      speak(result.text)
    } catch (err) {
      logger.error('[VoiceAnamnesis] Send failed', err)
      setError('No se pudo enviar tu mensaje. Intentá de nuevo.')
      setState('idle')
    }
  }, [currentInput, sessionId, speak])

  // ── Finish and extract data ──
  const finishConversation = useCallback(async () => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    window.speechSynthesis?.cancel()

    if (sessionId) {
      await fetchApi('/api/patients/anamnesis/live-relay', {
        method: 'POST',
        body: { action: 'end', sessionId },
      }).catch(() => {})
    }

    const entries = transcriptRef.current
    const firstUserMsg = entries.find(e => e.role === 'user')
    const fullText = entries.map(e => e.text).join(' ')

    onDataExtracted({
      chiefComplaint: firstUserMsg?.text ?? '',
      transcript: entries,
      detectedSections: detectSections(fullText),
    })

    setState('idle')
    setSessionId(null)
  }, [sessionId, onDataExtracted])

  // ── Manual text send (keyboard fallback) ──
  const sendTextManually = useCallback(async () => {
    if (!currentInput.trim() || !sessionId) return
    await stopAndSend()
  }, [currentInput, sessionId, stopAndSend])

  const isActive = sessionId !== null
  const isListening = state === 'listening'

  return (
    <div className="space-y-4">
      {/* AI greeting / status */}
      {!isActive ? (
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
          <p className="text-sm text-stone-500 mb-4">
            Contale a AutaMedica qué te trae a la consulta. La IA te va a hacer preguntas de seguimiento.
          </p>
          <button
            onClick={startSession}
            disabled={state === 'connecting'}
            className="mx-auto flex items-center gap-2 rounded-full bg-sky-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-sky-700 disabled:opacity-50"
          >
            {state === 'connecting' ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
            Iniciar conversación
          </button>
        </div>
      ) : (
        <>
          {/* Chat transcript */}
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

            {state === 'processing' && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-stone-100 px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-stone-400" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Live input */}
          {currentInput && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-3">
              <p className="text-sm text-sky-700 italic">{currentInput}</p>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-3">
            <button
              onClick={isListening ? stopAndSend : startListening}
              disabled={state === 'processing' || state === 'responding'}
              className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all ${
                isListening
                  ? 'bg-red-500 shadow-lg shadow-red-200 animate-pulse'
                  : 'bg-sky-500 shadow-lg shadow-sky-200 hover:bg-sky-600'
              } disabled:opacity-40 disabled:animate-none`}
            >
              {isListening ? (
                <MicOff className="h-6 w-6 text-white" />
              ) : state === 'processing' ? (
                <Loader2 className="h-6 w-6 text-white animate-spin" />
              ) : (
                <Mic className="h-6 w-6 text-white" />
              )}
            </button>

            {/* Text input fallback */}
            <input
              type="text"
              value={currentInput}
              onChange={e => setCurrentInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') sendTextManually() }}
              placeholder={isListening ? 'Escuchando...' : 'O escribí tu respuesta'}
              className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-3 text-sm focus:border-sky-400 focus:outline-none"
            />

            <button
              onClick={sendTextManually}
              disabled={!currentInput.trim() || state === 'processing'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white disabled:opacity-30"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>

          {/* Finish / status */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-stone-400">
              {state === 'listening' && 'Escuchando...'}
              {state === 'processing' && 'Procesando...'}
              {state === 'responding' && 'Respondiendo...'}
              {state === 'idle' && isActive && 'Tocá el micrófono para hablar'}
            </p>
            <button
              onClick={finishConversation}
              className="text-xs font-medium text-sky-600 hover:text-sky-800"
            >
              Finalizar conversación
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="text-xs text-red-500 text-center">{error}</p>
      )}

      <button
        onClick={onSwitchToText}
        className="w-full text-center text-sm text-stone-400 underline hover:text-stone-600"
      >
        Prefiero escribir
      </button>
    </div>
  )
}
