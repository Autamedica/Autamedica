import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import { getClientEnvOrDefault } from '@autamedica/shared'
import {
  acquireWakeLock,
  releaseWakeLock,
  setupWakeLockVisibilityHandler,
  setupVisibilityVideoPause,
  patchVideoPlayback,
} from '../media-optimizations'
import type { WebRTCClient } from '../webrtc-client'
import type { CloudflareCallsClient } from '../cloudflare-calls'
import type { ConnectionState } from '../webrtc-client'
import type { CallStatus } from '../calls/types'

interface RemoteUser {
  userId: string
  userType: string
  userName?: string
  stream?: MediaStream
}

interface UseCallLifecycleEffectsOptions {
  isInRoom: boolean
  isCallEstablished: boolean
  client: WebRTCClient | CloudflareCallsClient | null
  callId?: string
  connectionState: ConnectionState
  persistCallStatus: (status: CallStatus, reason?: string) => Promise<void>
  hasStartedCallRef: MutableRefObject<boolean>
  manualHangupRef: MutableRefObject<boolean>
  onCallStartRef: MutableRefObject<(() => void) | undefined>
  remoteUsers: Map<string, RemoteUser>
  remoteVideosRef: MutableRefObject<Map<string, HTMLVideoElement>>
  localVideoRef: RefObject<HTMLVideoElement | null>
  screenShareRef: RefObject<HTMLVideoElement | null>
  screenStream: MediaStream | null
  chatMessagesRef: RefObject<HTMLDivElement | null>
  chatMessages: unknown[]
  isChatPanelOpen: boolean
}

export function useCallLifecycleEffects({
  isInRoom,
  isCallEstablished,
  client,
  callId,
  connectionState,
  persistCallStatus,
  hasStartedCallRef,
  manualHangupRef,
  onCallStartRef,
  remoteUsers,
  remoteVideosRef,
  localVideoRef,
  screenShareRef,
  screenStream,
  chatMessagesRef,
  chatMessages,
  isChatPanelOpen,
}: UseCallLifecycleEffectsOptions) {
  const hasAnnouncedCallStartRef = useRef(false)

  // Call start announcement
  useEffect(() => {
    if (isCallEstablished && !hasAnnouncedCallStartRef.current) {
      hasAnnouncedCallStartRef.current = true
      onCallStartRef.current?.()
      return
    }
    if (!isCallEstablished) {
      hasAnnouncedCallStartRef.current = false
    }
  }, [isCallEstablished, onCallStartRef])

  // Wake Lock
  useEffect(() => {
    if (!isInRoom) return
    void acquireWakeLock()
    const cleanup = setupWakeLockVisibilityHandler()
    return () => { cleanup(); void releaseWakeLock() }
  }, [isInRoom])

  // Pause video when tab hidden
  useEffect(() => {
    if (!isInRoom || !client) return
    return setupVisibilityVideoPause(() => client.getLocalStream())
  }, [isInRoom, client])

  // Persist call status
  useEffect(() => {
    if (!callId || !hasStartedCallRef.current) return
    if (connectionState === 'connecting') { void persistCallStatus('connecting'); return }
    if (connectionState === 'connected' && isCallEstablished) { void persistCallStatus('connected'); return }
    if ((connectionState === 'closed' || connectionState === 'failed') && !manualHangupRef.current) {
      void persistCallStatus('ended', 'connection_closed')
    }
  }, [callId, connectionState, hasStartedCallRef, isCallEstablished, manualHangupRef, persistCallStatus])

  // Persist call status on page close via sendBeacon
  useEffect(() => {
    if (!callId || !hasStartedCallRef.current) return

    const handleBeforeUnload = () => {
      if (manualHangupRef.current) return
      const supabaseUrl = getClientEnvOrDefault('PUBLIC_SUPABASE_URL', '')
      const supabaseKey = getClientEnvOrDefault('PUBLIC_SUPABASE_ANON_KEY', '')
      if (!supabaseUrl || !supabaseKey) return

      const beaconUrl = `${new URL(supabaseUrl).origin}/functions/v1/update-call-status`
      const payload = JSON.stringify({ callId, status: 'ended', reason: 'page_closed' })
      const blob = new Blob([payload], { type: 'application/json' })
      navigator.sendBeacon(beaconUrl, blob)
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [callId, hasStartedCallRef, manualHangupRef])

  // Remote stream sync
  useEffect(() => {
    remoteUsers.forEach((user, uid) => {
      if (!user.stream) return
      const el = remoteVideosRef.current.get(uid)
      if (el && el.srcObject !== user.stream) {
        el.srcObject = user.stream
        patchVideoPlayback(el)
      }
    })
  }, [remoteUsers, remoteVideosRef])

  // Re-attach local stream on layout changes
  useEffect(() => {
    if (!client || !localVideoRef.current) return
    const stream = client.getLocalStream()
    if (stream && localVideoRef.current.srcObject !== stream) {
      localVideoRef.current.srcObject = stream
      patchVideoPlayback(localVideoRef.current)
    }
  }, [client, localVideoRef, remoteUsers])

  // Screen share sync
  useEffect(() => {
    if (screenShareRef.current && screenStream) screenShareRef.current.srcObject = screenStream
  }, [screenShareRef, screenStream])

  // Chat scroll
  useEffect(() => {
    if (chatMessagesRef.current) chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
  }, [chatMessages, chatMessagesRef, isChatPanelOpen])
}
