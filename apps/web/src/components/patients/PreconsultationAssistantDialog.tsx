import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { TranscriptDisplay, VoiceControls } from '@/components/patients/PreconsultationVoiceAssistantParts'

interface PreconsultationAssistantDialogProps {
  currentQuestion: string
  transcript: string
  isProcessing: boolean
  isListening: boolean
  isSpeaking: boolean
  useTextInput: boolean
  error: string | null
  onClose: () => void
  onTranscriptChange: (value: string) => void
  onToggleInputMode: () => void
  onToggleListening: () => void
  onNextTurn: () => void
  onSkip: () => void
}

export function PreconsultationAssistantDialog({
  currentQuestion,
  transcript,
  isProcessing,
  isListening,
  isSpeaking,
  useTextInput,
  error,
  onClose,
  onTranscriptChange,
  onToggleInputMode,
  onToggleListening,
  onNextTurn,
  onSkip,
}: PreconsultationAssistantDialogProps) {
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
        <motion.div
          className="fixed inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        <motion.div
          className="relative z-10 flex w-full max-w-2xl flex-col rounded-t-[32px] bg-white p-6 shadow-2xl sm:rounded-[32px]"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
        >
          {/* Dialog Header */}
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div className="flex flex-col gap-1.5 items-start">
              <h3 className="text-xl font-bold tracking-tight text-neutral-900">Preconsulta Virtual</h3>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-700 ring-1 ring-sky-100/60">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500"></span>
                </span>
                Triage Inteligente con Voz
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-neutral-100 p-2.5 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-600 shadow-sm"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Question Text */}
          <div className="my-8 px-4 text-center">
            <motion.h4
              key={currentQuestion}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-bold leading-relaxed text-neutral-900 md:text-2xl"
            >
              {currentQuestion}
            </motion.h4>
          </div>

          {/* Audio Visualization / Input Display */}
          <div className="flex min-h-[140px] flex-1 items-center justify-center px-4">
            <div className="w-full text-center">
              <TranscriptDisplay
                transcript={transcript}
                isProcessing={isProcessing}
                isListening={isListening}
                isSpeaking={isSpeaking}
                useTextInput={useTextInput}
                onTranscriptChange={onTranscriptChange}
              />
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-2 rounded-2xl border border-red-100 bg-red-50 p-3 text-center text-xs text-red-600">
              {error}
            </div>
          )}

          {/* Voice Controls and Skip Button */}
          <div className="mt-8 flex flex-col gap-5">
            <VoiceControls
              transcript={transcript}
              isProcessing={isProcessing}
              isListening={isListening}
              isSpeaking={isSpeaking}
              useTextInput={useTextInput}
              onToggleInputMode={onToggleInputMode}
              onToggleListening={onToggleListening}
              onNextTurn={onNextTurn}
            />

            <div className="pt-2 text-center border-t border-neutral-50">
              <button
                type="button"
                onClick={onSkip}
                className="text-xs font-semibold text-neutral-400 hover:text-neutral-600 transition-colors hover:underline"
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
