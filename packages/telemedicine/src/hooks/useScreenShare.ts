import { useState, useCallback } from 'react'
import { applyScreenShareHint } from '../media-optimizations'
import type { WebRTCClient } from '../webrtc-client'
import type { CloudflareCallsClient } from '../cloudflare-calls'

export function useScreenShare(client: WebRTCClient | CloudflareCallsClient | null) {
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      screenStream?.getTracks().forEach((t) => t.stop())
      setScreenStream(null)
      setIsScreenSharing(false)
      if (client && 'replaceVideoTrack' in client) {
        await (client as { replaceVideoTrack: (t: MediaStreamTrack | null) => Promise<void> }).replaceVideoTrack(null)
      }
      return
    }
    try {
      // Check getDisplayMedia support before calling (not available on most mobile browsers)
      if (!navigator.mediaDevices?.getDisplayMedia) {
        return
      }
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      applyScreenShareHint(stream)
      setScreenStream(stream)
      setIsScreenSharing(true)
      const screenTrack = stream.getVideoTracks()[0]
      if (screenTrack && client && 'replaceVideoTrack' in client) {
        await (client as { replaceVideoTrack: (t: MediaStreamTrack | null) => Promise<void> }).replaceVideoTrack(screenTrack)
      }
      screenTrack?.addEventListener('ended', async () => {
        setScreenStream(null)
        setIsScreenSharing(false)
        if (client && 'replaceVideoTrack' in client) {
          await (client as { replaceVideoTrack: (t: MediaStreamTrack | null) => Promise<void> }).replaceVideoTrack(null)
        }
      })
    } catch {
      setIsScreenSharing(false)
    }
  }, [isScreenSharing, screenStream, client])

  return { isScreenSharing, setIsScreenSharing, screenStream, setScreenStream, toggleScreenShare }
}
