import { useEffect, useRef } from 'react'
import { REMOTE_MEDIA_TIMEOUT_MESSAGE } from './useCallQuality'
import type { TelemedicineDebugLevel } from '../debug'

const REMOTE_MEDIA_TIMEOUT_MS = 20_000

interface UseRemoteMediaTimeoutOptions {
  isInRoom: boolean
  remoteUsersSize: number
  remoteUsersWithMediaCount: number
  callError: string | null
  setCallError: (error: string | null | ((current: string | null) => string | null)) => void
  setShowAudioOnlySuggestion: (show: boolean) => void
  emitDebug: (level: TelemedicineDebugLevel, message: string, payload?: Record<string, unknown>) => void
}

export function useRemoteMediaTimeout({
  isInRoom,
  remoteUsersSize,
  remoteUsersWithMediaCount,
  callError,
  setCallError,
  setShowAudioOnlySuggestion,
  emitDebug,
}: UseRemoteMediaTimeoutOptions) {
  const remoteMediaWaitStartedAtRef = useRef<number | null>(null)
  const remoteMediaTimeoutHandledRef = useRef(false)

  useEffect(() => {
    if (!isInRoom || remoteUsersSize === 0 || remoteUsersWithMediaCount > 0) {
      remoteMediaWaitStartedAtRef.current = null
      remoteMediaTimeoutHandledRef.current = false
      if (callError === REMOTE_MEDIA_TIMEOUT_MESSAGE) {
        setCallError(null)
      }
      return
    }

    if (remoteMediaTimeoutHandledRef.current) return

    if (remoteMediaWaitStartedAtRef.current === null) {
      remoteMediaWaitStartedAtRef.current = Date.now()
    }

    const elapsedMs = Date.now() - remoteMediaWaitStartedAtRef.current
    const remainingMs = Math.max(0, REMOTE_MEDIA_TIMEOUT_MS - elapsedMs)

    const handleTimeout = () => {
      remoteMediaTimeoutHandledRef.current = true
      setShowAudioOnlySuggestion(true)
      setCallError((current: string | null) => current ?? REMOTE_MEDIA_TIMEOUT_MESSAGE)
      emitDebug('warn', 'El peer entro a la sala pero el video remoto sigue sin aparecer', {
        remoteUsers: remoteUsersSize,
        timeoutMs: REMOTE_MEDIA_TIMEOUT_MS,
      })
    }

    if (remainingMs === 0) {
      handleTimeout()
      return
    }

    const timer = window.setTimeout(handleTimeout, remainingMs)
    return () => window.clearTimeout(timer)
  }, [callError, emitDebug, isInRoom, remoteUsersSize, remoteUsersWithMediaCount, setCallError, setShowAudioOnlySuggestion])
}
