import { motion } from 'framer-motion'
import { ArrowRight, Keyboard, Loader2, Mic } from 'lucide-react'

export function TranscriptDisplay({
  transcript,
  isProcessing,
  isListening,
  isSpeaking,
  useTextInput,
  onTranscriptChange,
}: {
  transcript: string
  isProcessing: boolean
  isListening: boolean
  isSpeaking: boolean
  useTextInput: boolean
  onTranscriptChange: (value: string) => void
}) {
  if (isProcessing) {
    return (
      <div className="flex flex-col items-center gap-3 text-neutral-500">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        <p className="text-sm">Analizando tus síntomas con el triage médico...</p>
      </div>
    )
  }

  if (isSpeaking) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex items-center justify-center h-20 w-20">
          <motion.div
            className="absolute inset-0 rounded-full bg-sky-500/20"
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute inset-2 rounded-full bg-sky-500/40"
            animate={{ scale: [1, 1.25, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
          />
          <div className="relative h-12 w-12 rounded-full bg-sky-500 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
            <Mic className="h-5 w-5 animate-pulse" />
          </div>
        </div>
        <p className="text-[10px] text-sky-500 font-bold uppercase tracking-wider animate-pulse">
          El asistente está hablando...
        </p>
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
        className="w-full rounded-2xl border border-neutral-200 p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500 transition focus:border-sky-500 resize-none bg-stone-50/30 text-stone-850"
      />
    )
  }

  if (transcript) {
    return (
      <div className="space-y-4">
        <p className="text-neutral-800 italic leading-relaxed text-sm bg-sky-50/50 rounded-2xl p-4 inline-block border border-sky-100/50 max-w-full shadow-sm">
          "{transcript}"
        </p>
      </div>
    )
  }

  if (isListening) {
    return (
      <div className="flex flex-col items-center gap-3">
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
        <p className="text-[10px] text-sky-500 font-bold uppercase tracking-wider">
          Te escuchamos... Hablá ahora
        </p>
      </div>
    )
  }

  return (
    <p className="text-sm text-neutral-400">
      Pulsá el micrófono para responder con voz
    </p>
  )
}

export function VoiceControls({
  transcript,
  isProcessing,
  isListening,
  isSpeaking,
  useTextInput,
  onToggleInputMode,
  onToggleListening,
  onNextTurn,
}: {
  transcript: string
  isProcessing: boolean
  isListening: boolean
  isSpeaking: boolean
  useTextInput: boolean
  onToggleInputMode: () => void
  onToggleListening: () => void
  onNextTurn: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-6">
      <button
        type="button"
        disabled={isProcessing}
        onClick={onToggleInputMode}
        className="rounded-full border border-neutral-200 p-3.5 text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-700 shadow-sm disabled:opacity-50"
        title={useTextInput ? 'Usar micrófono' : 'Escribir respuesta'}
      >
        {useTextInput ? <Mic className="h-5 w-5" /> : <Keyboard className="h-5 w-5" />}
      </button>

      {!useTextInput && (
        <button
          type="button"
          disabled={isProcessing || isSpeaking}
          onClick={onToggleListening}
          className={`relative rounded-full p-6 text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50 ${
            isListening ? 'bg-red-500 animate-pulse shadow-red-500/20' : 'bg-sky-500 hover:bg-sky-600 shadow-sky-500/20'
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
        disabled={!transcript.trim() || isProcessing || isSpeaking}
        onClick={onNextTurn}
        className="rounded-full bg-neutral-900 text-white p-3.5 transition disabled:opacity-40 disabled:cursor-not-allowed hover:bg-neutral-800 shadow-md"
      >
        <ArrowRight className="h-5 w-5" />
      </button>
    </div>
  )
}
