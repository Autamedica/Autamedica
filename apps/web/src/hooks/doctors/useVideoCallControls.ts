import { logger } from '@autamedica/shared'
import { useCallback, useEffect, useRef, useState } from 'react'

function stopMedia(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop()
  })
}

export function useVideoCallControls() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const screenShareRef = useRef<HTMLVideoElement | null>(null)

  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle')
  const [callDuration, setCallDuration] = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    if (callStatus !== 'live') {
      return
    }

    const interval = setInterval(() => {
      setCallDuration((prev) => prev + 1)
    }, 1_000)

    return () => clearInterval(interval)
  }, [callStatus])

  useEffect(() => {
    return () => {
      stopMedia(localStream)
      stopMedia(screenStream)
    }
  }, [localStream, screenStream])

  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (screenShareRef.current && screenStream) {
      screenShareRef.current.srcObject = screenStream
    }
  }, [screenStream])

  const handleActivateCamera = useCallback(async () => {
    if (callStatus === 'live') {
      return
    }

    try {
      setCameraError(null)
      setCallStatus('connecting')

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: true,
      })

      setLocalStream(stream)
      setIsVideoEnabled(true)
      setIsMuted(false)
      setCallDuration(0)
      setCallStatus('live')
    } catch (error) {
      logger.error('[VideoCall] Error al activar la cámara', error)
      const message =
        error instanceof DOMException
          ? error.message
          : 'No se pudo acceder a la cámara. Verifica los permisos del navegador.'
      setCameraError(message)
      setCallStatus('idle')
    }
  }, [callStatus])

  const handleToggleAudio = useCallback(() => {
    if (!localStream) {
      return
    }
    const nextMuted = !isMuted
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted
    })
    setIsMuted(nextMuted)
  }, [localStream, isMuted])

  const handleToggleVideo = useCallback(() => {
    if (!localStream) {
      return
    }
    const nextEnabled = !isVideoEnabled
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = nextEnabled
    })
    setIsVideoEnabled(nextEnabled)
  }, [localStream, isVideoEnabled])

  const handleToggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      stopMedia(screenStream)
      setScreenStream(null)
      setIsScreenSharing(false)
      return
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      setScreenStream(stream)
      setIsScreenSharing(true)
    } catch (error) {
      logger.warn('[VideoCall] El usuario canceló la compartición de pantalla', error)
      setIsScreenSharing(false)
    }
  }, [isScreenSharing, screenStream])

  const handleEndCall = useCallback(() => {
    stopMedia(localStream)
    stopMedia(screenStream)
    setLocalStream(null)
    setScreenStream(null)
    setIsVideoEnabled(false)
    setIsMuted(false)
    setIsScreenSharing(false)
    setCallStatus('ended')
  }, [localStream, screenStream])

  return {
    videoRef,
    screenShareRef,
    localStream,
    screenStream,
    isMuted,
    isVideoEnabled,
    isScreenSharing,
    callStatus,
    setCallStatus,
    callDuration,
    cameraError,
    handleActivateCamera,
    handleToggleAudio,
    handleToggleVideo,
    handleToggleScreenShare,
    handleEndCall,
  }
}
