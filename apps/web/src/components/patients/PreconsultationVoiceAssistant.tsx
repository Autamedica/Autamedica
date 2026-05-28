'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, X, ArrowRight, Loader2, Keyboard } from 'lucide-react'

interface PreconsultationVoiceAssistantProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (summary: any) => void
}

interface TurnHistoryItem {
  question: string
  answer: string
}

export function PreconsultationVoiceAssistant({
  isOpen,
  onClose,
  onComplete,
}: PreconsultationVoiceAssistantProps) {
  const [turnIndex, setTurnIndex] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState('¿Cuál es el motivo principal de tu consulta hoy?')
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [history, setHistory] = useState<TurnHistoryItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [useTextInput, setUseTextInput] = useState(false)
  
  const recognitionRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRecognition) {
        const rec = new SpeechRecognition()
        rec.continuous = false
        rec.interimResults = false
        rec.lang = 'es-AR'

        rec.onstart = () => {
          setIsListening(true)
          setError(null)
        }

        rec.onresult = (event: any) => {
          const resultText = event.results[0]?.[0]?.transcript ?? ''
          setTranscript(resultText)
        }

        rec.onerror = (event: any) => {
          loggerError('Speech recognition error', event.error)
          setError('No pudimos escuchar bien tu voz. Intentá hablar de nuevo o usá el teclado.')
          setIsListening(false)
        }

        rec.onend = () => {
          setIsListening(false)
        }

        recognitionRef.current = rec
      }
    }
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current) {
      setError('El reconocimiento de voz no está soportado en este navegador. Usá la opción de escribir.')
      setUseTextInput(true)
      return
    }

    if (isListening) {
      recognitionRef.current.stop()
    } else {
      setTranscript('')
      recognitionRef.current.start()
    }
  }

  const handleNextTurn = async () => {
    if (!transcript.trim()) return

    setIsProcessing(true)
    setError(null)

    try {
      const response = await fetch('/api/patients/appointments/pre-consultation/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnIndex,
          transcript,
          history,
        }),
      })

      const resData = await response.json()
      if (!resData.success) {
        throw new Error(resData.error || 'Error al procesar el turno')
      }

      const { status, nextQuestion, summary } = resData.data

      if (status === 'completed') {
        onComplete(summary)
      } else {
        setHistory((prev) => [...prev, { question: currentQuestion, answer: transcript }])
        setCurrentQuestion(nextQuestion)
        setTurnIndex((prev) => prev + 1)
        setTranscript('')
      }
    } catch (err) {
      setError('Hubo un problema al procesar tu respuesta. Intentá nuevamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  const loggerError = (msg: string, details: any) => {
    try {
      console.error(msg, details)
    } catch {
      // ignore logging failure
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/60 p-0 backdrop-blur-sm">
        <motion.div
          className="fixed inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
        
        <motion.div
          className="relative z-10 flex w-full max-w-2xl flex-col rounded-t-3xl bg-white p-6 shadow-2xl"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-neutral-900">Preconsulta Asistida</h3>
              <p className="text-xs text-neutral-500">Paso {turnIndex + 1} de 3</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-xl border border-neutral-100 p-2 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Question Display */}
          <div className="my-8 text-center px-4">
            <motion.h4
              key={currentQuestion}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-medium leading-relaxed text-neutral-900"
            >
              {currentQuestion}
            </motion.h4>
          </div>

          {/* Transcript / Input Area */}
          <div className="flex-1 min-h-[120px] flex items-center justify-center px-4">
            {isProcessing ? (
              <div className="flex flex-col items-center gap-3 text-neutral-500">
                <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
                <p className="text-sm">Procesando síntomas con el motor de Álvarez...</p>
              </div>
            ) : useTextInput ? (
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Escribí acá con detalle cómo te sentís..."
                rows={3}
                className="w-full rounded-2xl border border-neutral-200 p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition focus:border-sky-500 resize-none"
              />
            ) : (
              <div className="text-center w-full">
                {transcript ? (
                  <p className="text-neutral-800 italic leading-relaxed text-sm bg-neutral-50 rounded-2xl p-4 inline-block border border-neutral-100 max-w-full">
                    "{transcript}"
                  </p>
                ) : isListening ? (
                  <div className="flex items-center justify-center gap-1.5 h-12">
                    {[1, 2, 3, 4, 5].map((bar) => (
                      <motion.div
                        key={bar}
                        className="w-1.5 bg-sky-500 rounded-full"
                        animate={{ height: [12, 36, 12] }}
                        transition={{
                          duration: 0.8,
                          repeat: Infinity,
                          delay: bar * 0.15,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">Pulsá el micrófono y empezá a hablar</p>
                )}
              </div>
            )}
          </div>

          {/* Errors */}
          {error && (
            <div className="mx-4 mt-2 rounded-xl bg-red-50 border border-red-100 p-3 text-xs text-red-600 text-center">
              {error}
            </div>
          )}

          {/* Controls */}
          <div className="mt-8 flex flex-col gap-4">
            <div className="flex items-center justify-center gap-6">
              {/* Toggle Input Mode */}
              <button
                type="button"
                onClick={() => setUseTextInput(!useTextInput)}
                className="rounded-full border border-neutral-200 p-3.5 text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700 shadow-sm"
                title={useTextInput ? 'Usar micrófono' : 'Escribir respuesta'}
              >
                {useTextInput ? <Mic className="h-5 w-5" /> : <Keyboard className="h-5 w-5" />}
              </button>

              {/* Main Speak button */}
              {!useTextInput && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`relative rounded-full p-6 text-white shadow-lg transition-transform active:scale-95 ${
                    isListening ? 'bg-red-500 animate-pulse' : 'bg-sky-500 hover:bg-sky-600'
                  }`}
                >
                  <Mic className="h-7 w-7" />
                  {isListening && (
                    <span className="absolute inset-0 rounded-full border border-red-400 animate-ping opacity-75" />
                  )}
                </button>
              )}

              {/* Continue / Next button */}
              <button
                type="button"
                disabled={!transcript.trim() || isProcessing}
                onClick={handleNextTurn}
                className="rounded-full bg-neutral-900 text-white p-3.5 transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 shadow-md"
              >
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>

            {/* Emergency skip */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => onComplete(null)}
                className="text-xs font-semibold text-neutral-400 hover:text-neutral-600 hover:underline"
              >
                Saltar preconsulta e ingresar directo a la fila de guardia
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
