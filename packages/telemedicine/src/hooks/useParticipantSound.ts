import { useCallback, useRef } from 'react'

export function useParticipantSound() {
  const joinSoundContextRef = useRef<AudioContext | null>(null)

  const playParticipantJoinedSound = useCallback(async () => {
    if (typeof window === 'undefined') return

    const AudioContextCtor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext

    if (!AudioContextCtor) return

    try {
      let ctx = joinSoundContextRef.current

      if (!ctx || ctx.state === 'closed') {
        ctx = new AudioContextCtor()
        joinSoundContextRef.current = ctx
      }

      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const activeContext = ctx
      const startAt = ctx.currentTime + 0.02
      const master = activeContext.createGain()
      master.gain.setValueAtTime(0.0001, startAt)
      master.gain.exponentialRampToValueAtTime(0.08, startAt + 0.02)
      master.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.42)
      master.connect(activeContext.destination)

      const notes = [
        { frequency: 880, offset: 0 },
        { frequency: 1174.66, offset: 0.16 },
      ]

      notes.forEach(({ frequency, offset }) => {
        const noteStart = startAt + offset
        const oscillator = activeContext.createOscillator()
        const gain = activeContext.createGain()

        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, noteStart)
        gain.gain.setValueAtTime(0.0001, noteStart)
        gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.16)

        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(noteStart)
        oscillator.stop(noteStart + 0.2)
      })
    } catch {
      // Best-effort UX cue: audio restrictions must not break the call.
    }
  }, [])

  const cleanup = useCallback(() => {
    if (joinSoundContextRef.current?.state !== 'closed') joinSoundContextRef.current?.close()
    joinSoundContextRef.current = null
  }, [])

  return { playParticipantJoinedSound, cleanupSound: cleanup }
}
