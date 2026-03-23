/**
 * useCallRecording — Records a call using MediaRecorder API.
 * Combines local + remote streams into a single recording.
 * Outputs WebM file for download when stopped.
 */

import { useState, useRef, useCallback } from 'react'
import { logger } from '@autamedica/shared'

export interface CallRecordingState {
  isRecording: boolean
  isPaused: boolean
  durationSeconds: number
  error: string | null
}

export interface CallRecordingActions {
  start: (localStream: MediaStream | null, remoteStream: MediaStream | null) => void
  stop: () => void
  pause: () => void
  resume: () => void
}

export type CallRecordingHook = [CallRecordingState, CallRecordingActions]

function getMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ]
  for (const mime of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) return mime
  }
  return 'video/webm'
}

export function useCallRecording(): CallRecordingHook {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef<number>(0)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    recorderRef.current = null
    chunksRef.current = []
    setDurationSeconds(0)
    setIsPaused(false)
  }, [])

  const start = useCallback((localStream: MediaStream | null, remoteStream: MediaStream | null) => {
    if (recorderRef.current) return
    setError(null)

    try {
      // Combine streams into one
      const tracks: MediaStreamTrack[] = []
      if (remoteStream) remoteStream.getTracks().forEach((t) => tracks.push(t))
      if (localStream) localStream.getAudioTracks().forEach((t) => tracks.push(t))

      if (tracks.length === 0) {
        setError('No hay streams disponibles para grabar')
        return
      }

      const combined = new MediaStream(tracks)
      const mimeType = getMimeType()
      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 1_000_000 })

      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        a.download = `consulta-${ts}.webm`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        cleanup()
        setIsRecording(false)
      }

      recorder.onerror = () => {
        setError('Error durante la grabacion')
        cleanup()
        setIsRecording(false)
      }

      recorder.start(1000) // Collect data every second
      recorderRef.current = recorder
      startTimeRef.current = Date.now()
      setIsRecording(true)

      timerRef.current = setInterval(() => {
        setDurationSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 1000)
    } catch (err) {
      logger.error('[useCallRecording] Failed to start:', err)
      setError('No se pudo iniciar la grabacion')
    }
  }, [cleanup])

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }, [])

  const pause = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause()
      setIsPaused(true)
    }
  }, [])

  const resume = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume()
      setIsPaused(false)
    }
  }, [])

  return [
    { isRecording, isPaused, durationSeconds, error },
    { start, stop, pause, resume },
  ]
}
