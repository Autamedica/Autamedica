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

type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking'

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

export function VoiceAnamnesis({ onDataExtracted, onSwitchToText }: VoiceAnamnesisProps) {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [history, setHistory] = useState<Array<{ role: 'user' | 'model'; text: string }>>([])
  const [currentInput, setCurrentInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [started, setStarted] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef<TranscriptEntry[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => { transcriptRef.current = transcript }, [transcript])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript])
  useEffect(() => { return () => { recognitionRef.current?.abort(); window.speechSynthesis?.cancel() } }, [])

  // ── Start: get greeting from relay ──
  const start = useCallback(async () => {
    setError(null)
    setState('processing')
    try {
      const result = await fetchApi<RelayResponse>(
        '/api/patients/anamnesis/live-relay',
        { method: 'POST', body: { text: '' } },
      )
      if (!result?.text) throw new Error('No response')
      setStarted(true)
      setTranscript([{ role: 'assistant', text: result.text, timestamp: Date.now() }])
      speak(result.text)
    } catch (err) {
      logger.error('[VoiceAnamnesis] Start failed', err)
      setError('No se pudo conectar con el asistente')
      setState('idle')
    }
  }, [])

  // ── TTS ──
  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) { setState('idle'); return }
    setState('speaking')
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'es-AR'
    utterance.rate = 1.05
    utterance.onend = () => setState('idle')
    utterance.onerror = () => setState('idle')
    window.speechSynthesis.speak(utterance)
  }, [])

  // ── STT ──
  const startListening = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setError('Tu navegador no soporta reconocimiento de voz. Usá el campo de texto.'); return }

    const recognition = new SR()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (e) => {
      let text = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        text += e.results[i][0].transcript
      }
      setCurrentInput(text)
    }
    recognition.onerror = (e) => { if (e.error !== 'aborted') logger.warn('[Voice] STT error', e.error) }
    recognition.onend = () => setState(prev => prev === 'listening' ? 'idle' : prev)
    recognition.start()
    setState('listening')
  }, [])

  // ── Send message to relay ──
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return
    recognitionRef.current?.stop()
    recognitionRef.current = null
    window.speechSynthesis?.cancel()

    setTranscript(prev => [...prev, { role: 'user', text: text.trim(), timestamp: Date.now() }])
    setCurrentInput('')
    setState('processing')

    try {
      const result = await fetchApi<RelayResponse>(
        '/api/patients/anamnesis/live-relay',
        { method: 'POST', body: { text: text.trim(), history } },
      )
      if (!result?.text) throw new Error('No response')

      setHistory(result.history)
      setTranscript(prev => [...prev, { role: 'assistant', text: result.text, timestamp: Date.now() }])

      if (result.isComplete) {
        finish()
        return
      }
      speak(result.text)
    } catch (err) {
      logger.error('[Voice] Send failed', err)
      setError('No se pudo enviar. Intentá de nuevo.')
      setState('idle')
    }
  }, [history, speak])

  // ── Stop listening and send ──
  const stopAndSend = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    if (currentInput.trim()) sendMessage(currentInput)
    else setState('idle')
  }, [currentInput, sendMessage])

  // ── Finish ──
  const finish = useCallback(() => {
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
    const entries = transcriptRef.current
    const firstUser = entries.find(e => e.role === 'user')
    const fullText = entries.map(e => e.text).join(' ')
    onDataExtracted({
      chiefComplaint: firstUser?.text ?? '',
      transcript: entries,
      detectedSections: detectSections(fullText),
    })
  }, [onDataExtracted])

  const isListening = state === 'listening'

  if (!started) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-6 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100">
            <Mic className="h-8 w-8 text-sky-600" />
          </div>
          <h3 className="text-lg font-bold text-stone-900 mb-2">Anamnesis por voz</h3>
          <p className="text-sm text-stone-500 mb-5">
            Hablá naturalmente con la IA de AutaMedica. Te va a hacer preguntas sobre tu salud como si fuera una consulta.
          </p>
          <button
            onClick={start}
            disabled={state === 'processing'}
            className="mx-auto flex items-center gap-2 rounded-full bg-sky-600 px-8 py-4 text-base font-semibold text-white shadow-lg transition-all hover:bg-sky-700 disabled:opacity-50"
          >
            {state === 'processing' ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
            Iniciar conversación
          </button>
        </div>
        {error && <p className="text-xs text-red-500 text-center">{error}</p>}
        <button onClick={onSwitchToText} className="w-full text-center text-sm text-stone-400 underline hover:text-stone-600">
          <ArrowLeft className="inline h-3 w-3 mr-1" />Volver
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Chat */}
      <div className="space-y-3 max-h-80 overflow-y-auto rounded-xl border border-stone-200 bg-white p-4">
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
          disabled={state === 'processing' || state === 'speaking'}
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full transition-all ${
            isListening
              ? 'bg-red-500 shadow-lg shadow-red-200 animate-pulse'
              : 'bg-sky-500 shadow-lg shadow-sky-200 hover:bg-sky-600'
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
          onKeyDown={e => { if (e.key === 'Enter' && currentInput.trim()) sendMessage(currentInput) }}
          placeholder={isListening ? 'Escuchando...' : 'O escribí tu respuesta'}
          className="flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-3 text-sm focus:border-sky-400 focus:outline-none"
        />

        <button
          onClick={() => sendMessage(currentInput)}
          disabled={!currentInput.trim() || state === 'processing'}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white disabled:opacity-30"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>

      {/* Status + finish */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-400">
          {state === 'listening' && 'Escuchando...'}
          {state === 'processing' && 'Procesando...'}
          {state === 'speaking' && 'Respondiendo...'}
          {state === 'idle' && 'Tocá el micrófono para hablar'}
        </p>
        <button onClick={finish} className="text-xs font-medium text-sky-600 hover:text-sky-800">
          Finalizar
        </button>
      </div>

      {error && <p className="text-xs text-red-500 text-center">{error}</p>}

      <button onClick={onSwitchToText} className="w-full text-center text-sm text-stone-400 underline hover:text-stone-600">
        <ArrowLeft className="inline h-3 w-3 mr-1" />Volver
      </button>
    </div>
  )
}
