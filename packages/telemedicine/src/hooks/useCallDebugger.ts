import { useCallback, useMemo, useRef } from 'react'
import { createTelemedicineLogger, type TelemedicineDebugLevel } from '../debug'
import type { CallService } from '../calls/service'
import type { Json } from '@autamedica/types'

type CallServiceSubset = Pick<CallService, 'updateCallStatus' | 'logDebugEvent' | 'logEvent'>

interface UseCallDebuggerOptions {
  callId?: string
  roomId: string
  userId: string
  userType: string
  callServiceOverride?: CallServiceSubset
}

export function useCallDebugger({
  callId, roomId, userId, userType, callServiceOverride,
}: UseCallDebuggerOptions) {
  const callServiceRef = useRef<CallServiceSubset | null>(null)

  const debugLogger = useMemo(
    () => createTelemedicineLogger({ source: 'UnifiedVideoCall', callId, roomId, userId, userType }),
    [callId, roomId, userId, userType]
  )

  const emitDebug = useCallback(
    (level: TelemedicineDebugLevel, message: string, payload?: Record<string, unknown>) => {
      switch (level) {
        case 'error':
          debugLogger.error(message, undefined, payload)
          break
        case 'warn':
          debugLogger.warn(message, payload)
          break
        default:
          debugLogger.info(message, payload)
          break
      }

      if (!callId) return

      try {
        const callService = callServiceOverride ?? callServiceRef.current
        if (!callService) return

        callServiceRef.current = callService
        void callService.logDebugEvent(callId, level, 'UnifiedVideoCall', message, {
          roomId,
          userId,
          userType,
          ...payload,
        })
      } catch (error) {
        debugLogger.warn('No fue posible preparar persistencia de debug_log', {
          callId,
          roomId,
          error,
        })
      }
    },
    [callId, callServiceOverride, debugLogger, roomId, userId, userType]
  )

  const logCallEvent = useCallback(
    async (type: string, payload?: Record<string, unknown>) => {
      if (!callId) return
      try {
        const callService = callServiceOverride ?? callServiceRef.current
        if (!callService) return

        callServiceRef.current = callService
        await callService.logEvent(callId, type, {
          ...payload, reporterUserId: userId, reporterRole: userType, roomId,
        } as Json)
      } catch {
        // non-critical: don't block the call flow
      }
    },
    [callId, callServiceOverride, roomId, userId, userType]
  )

  return { emitDebug, logCallEvent, debugLogger, debugCallServiceRef: callServiceRef }
}

