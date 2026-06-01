'use client'

import { useState } from 'react'
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
  const [history, setHistory] = useState<TurnHistoryItem[]>([])
  const [useTextInput, setUseTextInput] = useState(false)
  const [preconsultationId, setPreconsultationId] = useState<string | undefined>()
  const { transcript, setTranscript, isListening, error, setError, toggleListening } = useSpeechRecognition()
  
  const handleNextTurn = async () => {
    if (!transcript.trim()) return

    setIsProcessing(true)
    setError(null)

    try {
      const response = await fetch('/api/patients/appointments/pre-consultation/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          preconsultationId,
          turnIndex,
          transcript,
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
        setHistory((prev) => [...prev, { question: currentQuestion, answer: transcript }])
        setCurrentQuestion(nextQuestion)
        setTurnIndex((prev) => prev + 1)
        setTranscript('')
      }
    } catch (err) {
      logger.error('[PreconsultationVoiceAssistant] turn processing failed', err)
      setError('Hubo un problema al procesar tu respuesta. Intentá nuevamente.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleToggleListening = () => {
    const supported = toggleListening()
    if (!supported) setUseTextInput(true)
  }

  if (!isOpen) return null

  return (
    <PreconsultationAssistantDialog
      turnIndex={turnIndex}
      currentQuestion={currentQuestion}
      transcript={transcript}
      isProcessing={isProcessing}
      isListening={isListening}
      useTextInput={useTextInput}
      error={error}
      onClose={onClose}
      onTranscriptChange={setTranscript}
      onToggleInputMode={() => setUseTextInput(!useTextInput)}
      onToggleListening={handleToggleListening}
      onNextTurn={handleNextTurn}
      onSkip={() => onComplete(null, preconsultationId)}
    />
  )
}
