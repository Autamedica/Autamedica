import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import {
  acquireWakeLock,
  releaseWakeLock,
  setupWakeLockVisibilityHandler,
  patchVideoPlayback,
} from '../media-optimizations'
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
  persistCallStatus: (status: CallStatus, reason?: string) => Promise<void>
  hasStartedCallRef: MutableRefObject<boolean>
  manualHangupRef: MutableRefObject<boolean>
  onCallStartRef: MutableRefObject<(() => void) | undefined>
  remoteUsers: Map<string, RemoteUser>
  remoteVideosRef: MutableRefObject<Map<string, HTMLVideoElement>>
  localVideoRef: RefObject<HTMLVideoElement | null>
  localStream: MediaStream | null
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
  localStream,
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

  // Pause video when tab hidden (removed for debugging black screen)
  // useEffect(() => {
  //   if (!isInRoom || !client) return
  //   return setupVisibilityVideoPause(() => client.getLocalStream())
  // }, [isInRoom, client])

  // Persist only join progress here. A transport close/failure can be a tab
  // refresh or short network outage; ending the business call at that point
  // prevents the participant from rejoining the same room.
  useEffect(() => {
    if (!callId || !hasStartedCallRef.current) return
    if (connectionState === 'connecting') { void persistCallStatus('connecting'); return }
    if (connectionState === 'connected' && isCallEstablished) { void persistCallStatus('connected'); return }
  }, [callId, connectionState, hasStartedCallRef, isCallEstablished, manualHangupRef, persistCallStatus])

  // On unload we only detach from media/signaling. The call is ended by the
  // explicit hangup action, not by refresh/navigation, so room rejoin remains
  // possible after transient browser/network interruptions.
  useEffect(() => {
    if (!callId || !hasStartedCallRef.current) return

    const handleBeforeUnload = () => {
      if (manualHangupRef.current) return

      // Fire a clean disconnect so the SFU frees the tracks and the other
      // peer gets user-left in <200ms instead of waiting for ICE timeout.
      // Fire-and-forget — we have no time to await before the tab dies.
      try { void client?.disconnect() } catch { /* ignore */ }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [callId, hasStartedCallRef, manualHangupRef, client])

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

  // Re-attach local stream on layout changes.
  // isInRoom/isCallEstablished are deps so this re-runs right after
  // ActiveCallLayout mounts the <video> element — otherwise a stream
  // that arrived before mount stays unbound because localVideoRef.current
  // is still null when the effect first runs.
  useEffect(() => {
    if (!localVideoRef.current) return
    const stream = localStream ?? client?.getLocalStream() ?? null
    if (stream && localVideoRef.current.srcObject !== stream) {
      localVideoRef.current.srcObject = stream
      patchVideoPlayback(localVideoRef.current)
    }
  }, [client, localVideoRef, localStream, remoteUsers, isInRoom, isCallEstablished])

  // Screen share sync
  useEffect(() => {
    if (screenShareRef.current && screenStream) screenShareRef.current.srcObject = screenStream
  }, [screenShareRef, screenStream])

  // Chat scroll
  useEffect(() => {
    if (chatMessagesRef.current) chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
  }, [chatMessages, chatMessagesRef, isChatPanelOpen])
}
