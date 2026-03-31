'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { NetworkPreflight } from '../network/preflight'
import type { PreflightResult } from '../network/preflight'

export interface UseNetworkPreflightReturn {
  result: PreflightResult | null
  isRunning: boolean
  rerun: () => void
}

export function useNetworkPreflight(iceServers: RTCIceServer[]): UseNetworkPreflightReturn {
  const [result, setResult] = useState<PreflightResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const preflightRef = useRef<NetworkPreflight | null>(null)

  const run = useCallback(async () => {
    if (!iceServers.length) return

    // Abort previous run if any
    preflightRef.current?.abort()

    const preflight = new NetworkPreflight()
    preflightRef.current = preflight

    setIsRunning(true)
    setResult(null)

    const res = await preflight.run(iceServers)
    setResult(res)
    setIsRunning(false)
  }, [iceServers])

  // Auto-run on mount
  useEffect(() => {
    void run()
    return () => {
      preflightRef.current?.abort()
    }
  }, [run])

  const rerun = useCallback(() => {
    void run()
  }, [run])

  return { result, isRunning, rerun }
}
