import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { TranscriptDisplay, VoiceControls } from '@/components/patients/PreconsultationVoiceAssistantParts'

interface PreconsultationAssistantDialogProps {
  turnIndex: number
  currentQuestion: string
  transcript: string
  isProcessing: boolean
  isListening: boolean
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
  turnIndex,
  currentQuestion,
  transcript,
  isProcessing,
  isListening,
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
          <div className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <div>
              <h3 className="text-lg font-bold text-neutral-900">Preconsulta Asistida</h3>
              <p className="text-xs text-neutral-500">Paso {turnIndex + 1} de 3</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-neutral-100 p-2 text-neutral-400 transition hover:bg-neutral-50 hover:text-neutral-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="my-8 px-4 text-center">
            <motion.h4
              key={currentQuestion}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-xl font-medium leading-relaxed text-neutral-900"
            >
              {currentQuestion}
            </motion.h4>
          </div>

          <div className="flex min-h-[120px] flex-1 items-center justify-center px-4">
            <div className="w-full text-center">
              <TranscriptDisplay
                transcript={transcript}
                isProcessing={isProcessing}
                isListening={isListening}
                useTextInput={useTextInput}
                onTranscriptChange={onTranscriptChange}
              />
            </div>
          </div>

          {error && (
            <div className="mx-4 mt-2 rounded-xl border border-red-100 bg-red-50 p-3 text-center text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="mt-8 flex flex-col gap-4">
            <VoiceControls
              transcript={transcript}
              isProcessing={isProcessing}
              isListening={isListening}
              useTextInput={useTextInput}
              onToggleInputMode={onToggleInputMode}
              onToggleListening={onToggleListening}
              onNextTurn={onNextTurn}
            />

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={onSkip}
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
