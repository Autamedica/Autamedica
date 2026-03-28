import { useCallback, useRef } from 'react'
import { logger } from '@autamedica/shared'
import { createCallService } from '../calls/service'
import type { CallService } from '../calls/service'
import type { CallStatus } from '../calls/types'

type PersistCallStatusOverride = (status: CallStatus, reason?: string) => Promise<void>
type CallServiceSubset = Pick<CallService, 'updateCallStatus' | 'logDebugEvent' | 'logEvent'>

interface UseCallStatusPersistenceOptions {
  callId?: string
  callServiceOverride?: CallServiceSubset
  persistCallStatusOverride?: PersistCallStatusOverride
}

export function useCallStatusPersistence({
  callId,
  callServiceOverride,
  persistCallStatusOverride,
}: UseCallStatusPersistenceOptions) {
  const lastPersistedCallStatusRef = useRef<CallStatus | null>(null)
  const callServiceRef = useRef<CallServiceSubset | null>(null)

  const persistCallStatus = useCallback(
    async (status: CallStatus, reason?: string) => {
      if (!callId) return

      if (lastPersistedCallStatusRef.current === status && !reason) return

      try {
        if (persistCallStatusOverride) {
          await persistCallStatusOverride(status, reason)
        } else {
          const callService = callServiceOverride
            ?? callServiceRef.current
            ?? createCallService()
          callServiceRef.current = callService
          await callService.updateCallStatus(callId, status, reason)
        }
        lastPersistedCallStatusRef.current = status
      } catch (error) {
        logger.warn('[UnifiedVideoCall] Failed to persist call status', {
          callId,
          status,
          error,
        })
      }
    },
    [callId, callServiceOverride, persistCallStatusOverride]
  )

  return { persistCallStatus, callServiceRef }
}
