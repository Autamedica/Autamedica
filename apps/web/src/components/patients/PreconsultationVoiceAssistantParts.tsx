import { motion } from 'framer-motion'
import { ArrowRight, Keyboard, Loader2, Mic } from 'lucide-react'

export function TranscriptDisplay({
  transcript,
  isProcessing,
  isListening,
  useTextInput,
  onTranscriptChange,
}: {
  transcript: string
  isProcessing: boolean
  isListening: boolean
  useTextInput: boolean
  onTranscriptChange: (value: string) => void
}) {
  if (isProcessing) {
    return (
      <div className="flex flex-col items-center gap-3 text-neutral-500">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        <p className="text-sm">Organizando tu información para el médico...</p>
      </div>
    )
  }

  if (useTextInput) {
    return (
      <textarea
        value={transcript}
        onChange={(e) => onTranscriptChange(e.target.value)}
        placeholder="Escribí acá con detalle cómo te sentís..."
        rows={3}
        className="w-full rounded-2xl border border-neutral-200 p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition focus:border-sky-500 resize-none"
      />
    )
  }

  if (transcript) {
    return (
      <p className="text-neutral-800 italic leading-relaxed text-sm bg-neutral-50 rounded-2xl p-4 inline-block border border-neutral-100 max-w-full">
        "{transcript}"
      </p>
    )
  }

  if (isListening) {
    return (
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
    )
  }

  return <p className="text-sm text-neutral-400">Pulsá el micrófono y empezá a hablar</p>
}

export function VoiceControls({
  transcript,
  isProcessing,
  isListening,
  useTextInput,
  onToggleInputMode,
  onToggleListening,
  onNextTurn,
}: {
  transcript: string
  isProcessing: boolean
  isListening: boolean
  useTextInput: boolean
  onToggleInputMode: () => void
  onToggleListening: () => void
  onNextTurn: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-6">
      <button
        type="button"
        onClick={onToggleInputMode}
        className="rounded-full border border-neutral-200 p-3.5 text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700 shadow-sm"
        title={useTextInput ? 'Usar micrófono' : 'Escribir respuesta'}
      >
        {useTextInput ? <Mic className="h-5 w-5" /> : <Keyboard className="h-5 w-5" />}
      </button>

      {!useTextInput && (
        <button
          type="button"
          onClick={onToggleListening}
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

      <button
        type="button"
        disabled={!transcript.trim() || isProcessing}
        onClick={onNextTurn}
        className="rounded-full bg-neutral-900 text-white p-3.5 transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 shadow-md"
      >
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  )
}
