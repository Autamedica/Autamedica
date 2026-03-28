import { useState, useEffect, useRef, useCallback } from 'react'

export interface AutoHideControlsState {
  controlsVisible: boolean
  resetControlsTimer: () => void
}

export function useAutoHideControls({ isInRoom }: { isInRoom: boolean }): AutoHideControlsState {
  const [controlsVisible, setControlsVisible] = useState(true)
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetControlsTimer = useCallback(() => {
    setControlsVisible(true)
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 5000)
  }, [])

  useEffect(() => {
    if (!isInRoom) {
      setControlsVisible(true)
      return
    }
    resetControlsTimer()
    return () => {
      if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current)
    }
  }, [isInRoom, resetControlsTimer])

  return { controlsVisible, resetControlsTimer }
}
