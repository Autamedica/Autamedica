'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Pause, Play, SkipForward, RotateCcw, Check, Bot } from 'lucide-react'

type OrbState = 'idle' | 'bot-speaking' | 'listening' | 'user-speaking' | 'paused' | 'confirmed'
type QuestionTone = 'medical' | 'casual' | 'sensitive'

interface VoiceOrbProps {
  state: OrbState
  questionTone?: QuestionTone
  audioLevel?: number // 0-1
  onPause?: () => void
  onResume?: () => void
  onSkip?: () => void
  onRepeat?: () => void
  transcript?: string
  questionNumber?: number
  totalQuestions?: number
}

const TONE_GRADIENTS: Record<QuestionTone, { from: string; to: string; shadow: string; ring: string }> = {
  medical: { from: 'from-sky-600', to: 'to-sky-800', shadow: 'shadow-sky-700/40', ring: 'border-sky-400/30' },
  casual: { from: 'from-sky-400', to: 'to-sky-500', shadow: 'shadow-sky-500/30', ring: 'border-sky-300/30' },
  sensitive: { from: 'from-indigo-500', to: 'to-indigo-700', shadow: 'shadow-indigo-600/40', ring: 'border-indigo-400/30' },
}

const USER_GRADIENT = { from: 'from-neutral-800', to: 'to-neutral-900', shadow: 'shadow-neutral-900/40', ring: 'border-neutral-600/30' }
const IDLE_GRADIENT = { from: 'from-neutral-100', to: 'to-neutral-200', shadow: 'shadow-neutral-300/20', ring: 'border-neutral-200' }

// Circular waveform visualizer
function CircularWaveform({ level, color, segments = 32 }: { level: number; color: string; segments?: number }) {
  const bars = Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2
    const baseHeight = 4
    const maxExtra = 16
    const noise = Math.sin(i * 0.8 + Date.now() / 200) * 0.5 + 0.5
    const height = baseHeight + maxExtra * level * noise
    return { angle, height }
  })

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {bars.map((bar, i) => {
        const radius = 90
        const x = Math.cos(bar.angle) * radius
        const y = Math.sin(bar.angle) * radius
        const rotation = (bar.angle * 180) / Math.PI + 90
        return (
          <motion.div
            key={i}
            className={`absolute w-[2px] rounded-full ${color}`}
            style={{
              left: `calc(50% + ${x}px - 1px)`,
              top: `calc(50% + ${y}px)`,
              transformOrigin: 'bottom center',
              transform: `rotate(${rotation}deg)`,
            }}
            animate={{ height: bar.height }}
            transition={{ duration: 0.1, ease: 'easeOut' }}
          />
        )
      })}
    </div>
  )
}

// Audio level bars (mic input indicator)
function AudioLevelBars({ level, count = 5 }: { level: number; count?: number }) {
  return (
    <div className="flex items-end justify-center gap-1 h-8">
      {Array.from({ length: count }, (_, i) => {
        const threshold = (i + 1) / count
        const active = level >= threshold * 0.8
        const height = 8 + (i * 4)
        return (
          <motion.div
            key={i}
            className={`w-1 rounded-full transition-colors ${
              active ? 'bg-sky-500' : 'bg-neutral-200'
            }`}
            animate={{ height: active ? height + level * 8 : height }}
            transition={{ duration: 0.1 }}
          />
        )
      })}
    </div>
  )
}

export function VoiceOrb({
  state,
  questionTone = 'casual',
  audioLevel = 0,
  onPause,
  onResume,
  onSkip,
  onRepeat,
  transcript,
  questionNumber,
  totalQuestions,
}: VoiceOrbProps) {
  const isSpeaking = state === 'bot-speaking' || state === 'user-speaking'
  const isBot = state === 'bot-speaking'
  const isUser = state === 'user-speaking'
  const isPaused = state === 'paused'
  const isConfirmed = state === 'confirmed'

  const gradient = isBot ? TONE_GRADIENTS[questionTone]
    : isUser ? USER_GRADIENT
    : IDLE_GRADIENT

  const waveformColor = isBot ? 'bg-white/80' : isUser ? 'bg-white/60' : 'bg-neutral-300'

  return (
    <div className="flex flex-col items-center">
      {/* Progress indicator */}
      {questionNumber !== undefined && totalQuestions !== undefined && (
        <motion.div
          className="mb-8 flex items-center gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div className="flex gap-1">
            {Array.from({ length: totalQuestions }, (_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i < questionNumber ? 'w-6 bg-sky-500' : i === questionNumber ? 'w-6 bg-neutral-400' : 'w-3 bg-neutral-200'
                }`}
              />
            ))}
          </div>
          <span className="text-xs text-neutral-500 ml-2">{questionNumber}/{totalQuestions}</span>
        </motion.div>
      )}

      {/* Orb container */}
      <div className="relative mb-12" style={{ width: 200, height: 200 }}>
        {/* Circular waveform */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CircularWaveform
                level={isUser ? audioLevel : 0.5 + Math.sin(Date.now() / 300) * 0.3}
                color={waveformColor}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pulse rings */}
        <AnimatePresence>
          {isSpeaking && (
            <>
              <motion.div
                className={`absolute rounded-full border-2 ${gradient.ring}`}
                style={{ inset: -20 }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1.3, opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <motion.div
                className={`absolute rounded-full border ${gradient.ring}`}
                style={{ inset: -10 }}
                initial={{ scale: 0.9, opacity: 0.3 }}
                animate={{ scale: 1.2, opacity: 0 }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              />
            </>
          )}
        </AnimatePresence>

        {/* Listening pulse */}
        {state === 'listening' && (
          <motion.div
            className="absolute rounded-full border-2 border-neutral-300"
            style={{ inset: -10 }}
            animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        {/* Main orb */}
        <motion.div
          className={`size-40 rounded-full flex items-center justify-center mx-auto bg-gradient-to-br ${gradient.from} ${gradient.to} shadow-2xl ${gradient.shadow}`}
          animate={{
            scale: isSpeaking ? [1, 1.05, 1] : isPaused ? 0.95 : 1,
          }}
          transition={{
            duration: 1.5,
            repeat: isSpeaking ? Infinity : 0,
          }}
          style={{ marginLeft: 20, marginTop: 20 }}
        >
          {/* Confirmed checkmark */}
          {isConfirmed && (
            <motion.div
              initial={{ scale: 0, rotate: -45 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <Check className="size-16 text-white" />
            </motion.div>
          )}

          {/* Waveform bars inside orb when speaking */}
          {isSpeaking && !isConfirmed && (
            <div className="flex items-center justify-center gap-1">
              {[...Array(5)].map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1.5 rounded-full bg-white"
                  animate={{ height: [16, 36, 16] }}
                  transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.12 }}
                />
              ))}
            </div>
          )}

          {/* Icons for idle/listening/paused */}
          {!isSpeaking && !isConfirmed && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring' }}
            >
              {isPaused ? (
                <Pause className="size-16 text-neutral-400" />
              ) : state === 'listening' ? (
                <Mic className="size-16 text-neutral-400" />
              ) : (
                <Bot className="size-16 text-neutral-400" />
              )}
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* Audio level indicator (only when user is speaking or listening) */}
      {(state === 'user-speaking' || state === 'listening') && (
        <motion.div
          className="mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <AudioLevelBars level={audioLevel} />
          <p className="text-xs text-neutral-400 text-center mt-1">Nivel de micrófono</p>
        </motion.div>
      )}

      {/* Transcript */}
      {transcript && (
        <motion.div
          className="max-w-2xl w-full text-center mb-8 px-4"
          key={transcript}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <p className={`text-2xl lg:text-3xl leading-relaxed ${
            isBot ? 'text-sky-900' : isUser ? 'text-neutral-900' : 'text-neutral-400'
          }`}>
            {transcript}
          </p>
        </motion.div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-3">
        {/* Repeat button */}
        {onRepeat && (state === 'listening' || state === 'paused') && (
          <motion.button
            type="button"
            onClick={onRepeat}
            className="flex items-center gap-2 px-4 py-2.5 border border-neutral-200 text-neutral-600 rounded-full text-sm hover:border-neutral-900 transition-all"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <RotateCcw className="size-4" />
            Repetir
          </motion.button>
        )}

        {/* Pause/Resume */}
        {(onPause || onResume) && (state !== 'idle' && state !== 'confirmed') && (
          <motion.button
            type="button"
            onClick={isPaused ? onResume : onPause}
            className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white rounded-full text-sm hover:bg-neutral-800 transition-all"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
            {isPaused ? 'Continuar' : 'Pausar'}
          </motion.button>
        )}

        {/* Skip button */}
        {onSkip && (state === 'listening' || state === 'paused') && (
          <motion.button
            type="button"
            onClick={onSkip}
            className="flex items-center gap-2 px-4 py-2.5 border border-neutral-200 text-neutral-600 rounded-full text-sm hover:border-neutral-900 transition-all"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Saltar
            <SkipForward className="size-4" />
          </motion.button>
        )}
      </div>
    </div>
  )
}
