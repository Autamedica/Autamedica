'use client'

import { useEffect, useRef, useState } from 'react'
import { fetchTurnCredentials } from '../config/ice-servers'

interface UseTurnCredentialsResult {
  iceServers: RTCIceServer[] | undefined
  loading: boolean
}

/**
 * Fetches ephemeral Cloudflare Calls TURN credentials from the app's
 * /api/turn-credentials endpoint. Returns undefined while loading so callers
 * can delay WebRTC initialization until credentials are ready.
 *
 * @param apiUrl - Path to the turn-credentials API route (default: '/api/turn-credentials')
 */
export function useTurnCredentials(
  apiUrl = '/api/turn-credentials'
): UseTurnCredentialsResult {
  const [iceServers, setIceServers] = useState<RTCIceServer[] | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    void fetchTurnCredentials(apiUrl).then((servers) => {
      setIceServers(servers)
      setLoading(false)
    })
  }, [apiUrl])

  return { iceServers, loading }
}
