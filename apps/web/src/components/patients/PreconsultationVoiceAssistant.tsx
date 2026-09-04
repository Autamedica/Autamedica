'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { logger } from '@autamedica/shared'
import { useSpeechRecognition } from '@/hooks/patients/useSpeechRecognition'
import type { PreconsultationSummary } from '@/lib/patients/types/pre-consultation'
import { PreconsultationAssistantDialog } from '@/components/patients/PreconsultationAssistantDialog'

interface PreconsultationVoiceAssistantProps {
  isOpen: boolean
  onClose: () => void
  onComplete: (summary: PreconsultationSummary | null, preconsultationId?: string) => void
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
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [history, setHistory] = useState<TurnHistoryItem[]>([])
  const [useTextInput, setUseTextInput] = useState(false)
  const [preconsultationId, setPreconsultationId] = useState<string | undefined>()
  const { transcript, setTranscript, isListening, error, setError, toggleListening } = useSpeechRecognition()

  const ttsSessionRef = useRef<number>(0)
  const isListeningRef = useRef(isListening)
  const hasSpokenInitialRef = useRef(false)

  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  const startListening = useCallback(() => {
    if (!isListeningRef.current && !useTextInput) {
      toggleListening()
    }
  }, [toggleListening, useTextInput])

  const stopListening = useCallback(() => {
    if (isListeningRef.current) {
      toggleListening()
    }
  }, [toggleListening])

  // TTS speaking function
  const speakQuestion = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) {
      startListening()
      return
    }

    // Cancel current synthesis and increment session ID
    window.speechSynthesis.cancel()
    ttsSessionRef.current += 1
    const sessionId = ttsSessionRef.current

    // Clean text for speaking to ensure it reads nicely
    const cleanText = text
      .replace(/¿|\?/g, '')
      .replace(/\(|\)/g, '')
      .trim()

    const utterance = new SpeechSynthesisUtterance(cleanText)
    utterance.lang = 'es-AR' // Argentine Spanish localized voice
    utterance.rate = 0.95 // Professional, calm pace

    utterance.onstart = () => {
      if (ttsSessionRef.current !== sessionId) return
      setIsSpeaking(true)
    }

    utterance.onend = () => {
      if (ttsSessionRef.current !== sessionId) return
      setIsSpeaking(false)
      // Automatically start listening once speaking completes!
      startListening()
    }

    utterance.onerror = (e) => {
      console.warn('[Preconsultation] TTS utterance error:', e)
      if (ttsSessionRef.current !== sessionId) return
      setIsSpeaking(false)
      startListening()
    }

    window.speechSynthesis.speak(utterance)
  }, [startListening])

  // Speak initial question when opened
  useEffect(() => {
    if (isOpen && !hasSpokenInitialRef.current) {
      hasSpokenInitialRef.current = true
      // Short timeout to let browser layout stabilize and load speech engines
      const timeout = setTimeout(() => {
        speakQuestion('¿Cuál es el motivo principal de tu consulta hoy?')
      }, 500)
      return () => clearTimeout(timeout)
    }
  }, [isOpen, speakQuestion])

  // Cleanup synthesis on close
  useEffect(() => {
    if (!isOpen) {
      window.speechSynthesis?.cancel()
      hasSpokenInitialRef.current = false
      setTurnIndex(0)
      setCurrentQuestion('¿Cuál es el motivo principal de tu consulta hoy?')
      setHistory([])
      setPreconsultationId(undefined)
      if (isListeningRef.current) {
        toggleListening()
      }
    }
  }, [isOpen, toggleListening])

  const handleNextTurn = useCallback(async (forcedTranscript?: string) => {
    const activeTranscript = forcedTranscript ?? transcript
    if (!activeTranscript.trim()) return

    setIsProcessing(true)
    setError(null)
    stopListening()

    try {
      const response = await fetch('/api/patients/appointments/pre-consultation/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          preconsultationId,
          turnIndex,
          transcript: activeTranscript,
          history,
        }),
      })

      const resData = await response.json()
      if (!resData.success) {
        throw new Error(resData.error || 'Error al procesar el turno')
      }

      const { status, nextQuestion, summary, preconsultationId: returnedPreconsultationId } = resData.data
      if (returnedPreconsultationId && returnedPreconsultationId !== 'draft-session') {
        setPreconsultationId(returnedPreconsultationId)
      }

      if (status === 'completed') {
        onComplete(summary, returnedPreconsultationId)
      } else {
        setHistory((prev) => [...prev, { question: currentQuestion, answer: activeTranscript }])
        setCurrentQuestion(nextQuestion)
        setTurnIndex((prev) => prev + 1)
        setTranscript('')
        
        // Automatically speak the next question!
        speakQuestion(nextQuestion)
      }
    } catch (err) {
      logger.error('[PreconsultationVoiceAssistant] turn processing failed', err)
      setError('No pudimos escuchar bien tu voz. Intentá hablar de nuevo o usá el teclado.')
    } finally {
      setIsProcessing(false)
    }
  }, [preconsultationId, turnIndex, transcript, history, currentQuestion, speakQuestion, stopListening, onComplete, setError, setTranscript])

  // Watch for isListening transition from true to false while recording to auto-advance
  const prevIsListeningRef = useRef(isListening)
  useEffect(() => {
    if (prevIsListeningRef.current === true && isListening === false && !useTextInput && !isProcessing && !isSpeaking) {
      if (transcript.trim()) {
        // Automatically submit turn when silence is detected and speech ends!
        void handleNextTurn()
      }
    }
    prevIsListeningRef.current = isListening
  }, [isListening, transcript, useTextInput, isProcessing, isSpeaking, handleNextTurn])

  const handleToggleListening = () => {
    const supported = toggleListening()
    if (!supported) setUseTextInput(true)
  }

  if (!isOpen) return null

  return (
    <PreconsultationAssistantDialog
      currentQuestion={currentQuestion}
      transcript={transcript}
      isProcessing={isProcessing}
      isListening={isListening}
      isSpeaking={isSpeaking}
      useTextInput={useTextInput}
      error={error}
      onClose={onClose}
      onTranscriptChange={setTranscript}
      onToggleInputMode={() => {
        const nextMode = !useTextInput
        setUseTextInput(nextMode)
        if (nextMode) {
          stopListening()
        } else {
          // If returning to voice mode, speak question to trigger voice cycle
          speakQuestion(currentQuestion)
        }
      }}
      onToggleListening={handleToggleListening}
      onNextTurn={() => handleNextTurn()}
      onSkip={() => onComplete(null, preconsultationId)}
    />
  )
}
