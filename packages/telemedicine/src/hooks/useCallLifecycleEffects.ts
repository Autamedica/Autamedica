import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import {
  acquireWakeLock,
  releaseWakeLock,
  setupWakeLockVisibilityHandler,
  setupVisibilityVideoPause,
  patchVideoPlayback,
} from '../media-optimizations'
import type { CallSessionRuntime } from '../call-session/types'
import type { CallProvider, ConnectionState } from '../providers/types'
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
  client: CallProvider | null
  callId?: string
  connectionState: ConnectionState
  runtime?: CallSessionRuntime
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
  supabaseUrl?: string
  supabaseAnonKey?: string
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
  supabaseUrl,
  supabaseAnonKey,
  runtime,
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

  // Persist call status on page close via fetch+keepalive
  useEffect(() => {
    if (!callId || !hasStartedCallRef.current || !supabaseUrl || !supabaseAnonKey) return

    const handleBeforeUnload = () => {
      if (manualHangupRef.current) return
      const url = `${new URL(supabaseUrl).origin}/functions/v1/update-call-status`
      const payload = JSON.stringify({ callId, status: 'ended', reason: 'page_closed', runtime })
      fetch(url, {
        method: 'POST',
        keepalive: true,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'apikey': supabaseAnonKey,
        },
        body: payload,
      }).catch(() => { /* best-effort on page close */ })
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [callId, hasStartedCallRef, manualHangupRef, runtime, supabaseUrl, supabaseAnonKey])

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
