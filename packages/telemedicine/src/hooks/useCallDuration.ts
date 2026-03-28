import { useState, useEffect, useMemo } from 'react'

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export interface CallDurationState {
  connectedAt: number | null
  elapsedSeconds: number
  formattedDuration: string
  setConnectedAt: React.Dispatch<React.SetStateAction<number | null>>
}

export function useCallDuration(isCallEstablished: boolean): CallDurationState {
  const [connectedAt, setConnectedAt] = useState<number | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)

  useEffect(() => {
    if (isCallEstablished) {
      setConnectedAt((prev) => prev ?? Date.now())
    } else {
      setConnectedAt(null)
      setElapsedSeconds(0)
    }
  }, [isCallEstablished])

  useEffect(() => {
    if (connectedAt === null) return
    const tick = () => setElapsedSeconds(Math.floor((Date.now() - connectedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [connectedAt])

  const formattedDuration = useMemo(() => formatDuration(elapsedSeconds), [elapsedSeconds])

  return { connectedAt, elapsedSeconds, formattedDuration, setConnectedAt }
}
