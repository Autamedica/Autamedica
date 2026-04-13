import { useState, useEffect, useRef, useMemo } from 'react'
import type { WarmUpResult } from '../providers/types'

export interface GreenRoomChecks {
  hasVideo: boolean
  hasAudio: boolean
  hasSignaling: boolean
  allReady: boolean
}

export interface GreenRoomState {
  audioLevel: number
  greenRoomChecks: GreenRoomChecks
}

export function useGreenRoom({
  warmUpResult,
  isInRoom,
}: {
  warmUpResult: WarmUpResult | null
  isInRoom: boolean
}): GreenRoomState {
  const [audioLevel, setAudioLevel] = useState(0)
  const audioContextRef = useRef<AudioContext | null>(null)
  const audioAnalyserRef = useRef<AnalyserNode | null>(null)
  const audioAnimFrameRef = useRef<number | null>(null)

  useEffect(() => {
    if (!warmUpResult?.stream || isInRoom) return

    const audioTrack = warmUpResult.stream.getAudioTracks()[0]
    if (!audioTrack) return

    try {
      const ctx = new AudioContext()
      audioContextRef.current = ctx
      const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]))
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.3
      source.connect(analyser)
      audioAnalyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)

      const tick = () => {
        analyser.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const avg = sum / dataArray.length
        setAudioLevel(Math.min(avg / 128, 1))
        audioAnimFrameRef.current = requestAnimationFrame(tick)
      }
      tick()
    } catch {
      // AudioContext not supported
    }

    return () => {
      if (audioAnimFrameRef.current) cancelAnimationFrame(audioAnimFrameRef.current)
      if (audioContextRef.current?.state !== 'closed') audioContextRef.current?.close()
      audioContextRef.current = null
    }
  }, [isInRoom, warmUpResult])

  const greenRoomChecks = useMemo(() => {
    const hasVideo = warmUpResult?.stream?.getVideoTracks()?.[0]?.readyState === 'live'
    const hasAudio = warmUpResult?.stream?.getAudioTracks()?.[0]?.readyState === 'live'
    const hasSignaling = warmUpResult?.signalingReady ?? false
    const allReady = hasVideo && hasAudio && hasSignaling
    return { hasVideo, hasAudio, hasSignaling, allReady }
  }, [warmUpResult])

  return { audioLevel, greenRoomChecks }
}
