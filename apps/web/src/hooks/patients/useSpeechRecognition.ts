import { useCallback, useEffect, useRef, useState } from 'react'
import { logger } from '@autamedica/shared'

interface SpeechRecognitionResultLike {
  transcript: string
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<SpeechRecognitionResultLike>>
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface SpeechRecognitionLike {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: ((event: Event) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onend: ((event: Event) => void) | null
  start: () => void
  stop: () => void
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

export function useSpeechRecognition(lang?: string) {
  const [transcript, setTranscript] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  useEffect(() => {
    const speechWindow = window as unknown as SpeechWindow
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    
    // Auto-detect Portuguese or use provided lang
    const defaultLang = typeof document !== 'undefined' && document.documentElement.lang?.startsWith('pt') 
      ? 'pt-BR' 
      : 'es-AR'
    recognition.lang = lang ?? defaultLang

    recognition.onstart = () => {
      setIsListening(true)
      setError(null)
    }

    recognition.onresult = (event) => {
      setTranscript(event.results[0]?.[0]?.transcript ?? '')
    }

    recognition.onerror = (event) => {
      logger.error('[PreconsultationVoiceAssistant] Speech recognition error', { error: event.error })
      setError('No pudimos escuchar bien tu voz. Intentá hablar de nuevo o usá el teclado.')
      setIsListening(false)
    }

    recognition.onend = () => {
      setIsListening(false)
    }

    recognitionRef.current = recognition
  }, [])

  const toggleListening = useCallback((): boolean => {
    if (!recognitionRef.current) {
      setError('El reconocimiento de voz no está soportado en este navegador. Usá la opción de escribir.')
      return false
    }

    if (isListening) {
      recognitionRef.current.stop()
    } else {
      setTranscript('')
      recognitionRef.current.start()
    }

    return true
  }, [isListening])

  return {
    transcript,
    setTranscript,
    isListening,
    error,
    setError,
    toggleListening,
  }
}
