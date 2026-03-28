/**
 * Signaling WebSocket management for WebRTC
 * Extracted from webrtc-client.ts to reduce file size
 */

interface SignalingLogger {
  logInfo(msg: string, ctx?: Record<string, unknown>): void
  logWarn(msg: string, ctx?: Record<string, unknown>): void
  logError(msg: string, error: unknown, ctx?: Record<string, unknown>): void
}

/** Generic signaling message (avoids circular import with webrtc-client) */
type SignalingMessage = { type: string; from?: string; data?: unknown }

type ConnectionStateSetter = (state: string) => void
type MessageHandler = (message: SignalingMessage) => void
type EventEmitter = (event: string, ...args: unknown[]) => void

interface SignalingSocketDeps {
  logger: SignalingLogger
  setConnectionState: ConnectionStateSetter
  handleMessage: MessageHandler
  emit: EventEmitter
  cleanup: () => void
}

const SIGNALING_TIMEOUT_MS = 8000

export function openSignalingSocket(
  signalingUrl: string,
  roomId: string,
  deps: SignalingSocketDeps,
  currentWs: { ws: WebSocket | null; promise: Promise<void> | null },
): Promise<void> {
  const wsUrl = `${signalingUrl}?roomId=${encodeURIComponent(roomId)}`

  if (currentWs.ws?.readyState === WebSocket.OPEN) {
    return Promise.resolve()
  }

  if (currentWs.ws?.readyState === WebSocket.CONNECTING && currentWs.promise) {
    return currentWs.promise
  }

  const socket = new WebSocket(wsUrl)
  currentWs.ws = socket

  const openPromise = new Promise<void>((resolve, reject) => {
    const wsOpenedAt = performance.now()
    deps.logger.logInfo('Opening signaling socket', { signalingUrl, wsUrl })

    const timeout = setTimeout(() => {
      try { socket.close() } catch { /* ignore */ }
      if (currentWs.ws === socket) { currentWs.ws = null }
      reject(new Error('Signaling connection timeout'))
    }, SIGNALING_TIMEOUT_MS)

    socket.onopen = () => {
      if (currentWs.ws !== socket) {
        clearTimeout(timeout)
        try { socket.close(1000, 'stale_socket') } catch { /* ignore */ }
        resolve()
        return
      }
      clearTimeout(timeout)
      const latencyMs = Math.round(performance.now() - wsOpenedAt)
      deps.logger.logInfo('WebSocket connected (pre-warm)', { latencyMs })
      deps.emit('signaling-connected', { latencyMs })
      resolve()
    }

    socket.onmessage = (event) => {
      if (currentWs.ws !== socket) return
      try {
        deps.handleMessage(JSON.parse(event.data) as SignalingMessage)
      } catch (error) {
        deps.logger.logError('Failed parsing signaling message', error, {
          payloadPreview: String(event.data).slice(0, 200),
        })
      }
    }

    socket.onerror = (error) => {
      if (currentWs.ws !== socket) {
        clearTimeout(timeout)
        reject(new Error('Stale WebSocket connection failed'))
        return
      }
      clearTimeout(timeout)
      deps.logger.logError('WebSocket error', error)
      deps.setConnectionState('failed')
      deps.emit('error', new Error('WebSocket connection failed'))
      currentWs.ws = null
      reject(new Error('WebSocket connection failed'))
    }

    socket.onclose = () => {
      if (currentWs.ws !== socket) return
      deps.logger.logInfo('WebSocket disconnected')
      currentWs.ws = null
      deps.setConnectionState('disconnected')
      deps.cleanup()
    }
  })

  const managedPromise = openPromise.finally(() => {
    if (currentWs.promise === managedPromise) {
      currentWs.promise = null
    }
  })

  currentWs.promise = managedPromise
  return managedPromise
}
