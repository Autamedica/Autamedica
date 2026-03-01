/**
 * WebRTC Diagnostics with Retry Logic for AutaMedica
 * Handles getUserMedia failures, connection monitoring, and TURN fallbacks
 */

import { logger } from './services/logger.service';

export interface MediaDiagnostics {
  devices: MediaDeviceInfo[]
  permissions: {
    camera: PermissionState
    microphone: PermissionState
  }
  capabilities: {
    video: MediaTrackCapabilities | null
    audio: MediaTrackCapabilities | null
  }
}

export interface RetryConfig {
  maxRetries: number
  initialDelay: number
  backoffMultiplier: number
  maxDelay: number
}

export interface MediaConstraints {
  video: boolean | MediaTrackConstraints
  audio: boolean | MediaTrackConstraints
}

export interface ICEServerConfig {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface ConnectionStats {
  bytesReceived: number
  bytesSent: number
  packetsReceived: number
  packetsSent: number
  connectionState: RTCPeerConnectionState
  iceConnectionState: RTCIceConnectionState
  timestamp: number
}

export class WebRTCDiagnostics {
  private static readonly DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    backoffMultiplier: 2,
    maxDelay: 10000
  }

  private static readonly FALLBACK_CONSTRAINTS: MediaConstraints[] = [
    // Best quality
    {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    },
    // Medium quality
    {
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 }
      },
      audio: { echoCancellation: true }
    },
    // Low quality
    {
      video: { width: { max: 320 }, height: { max: 240 } },
      audio: true
    },
    // Audio only
    {
      video: false,
      audio: true
    }
  ]

  /**
   * Get user media with retry logic and fallback constraints
   */
  static async getUserMediaWithRetry(config: Partial<RetryConfig> = {}): Promise<MediaStream> {
    const retryConfig = { ...this.DEFAULT_RETRY_CONFIG, ...config }

    for (const constraints of this.FALLBACK_CONSTRAINTS) {
      try {
        logger.info('🎥 Intentando getUserMedia con:', constraints)
        const stream = await this.attemptGetUserMedia(constraints, retryConfig)

        logger.info('✅ getUserMedia exitoso:', {
          video: stream.getVideoTracks().length > 0,
          audio: stream.getAudioTracks().length > 0,
          videoTrack: stream.getVideoTracks()[0]?.getSettings(),
          audioTrack: stream.getAudioTracks()[0]?.getSettings()
        })

        return stream
      } catch (error) {
        logger.warn('⚠️ getUserMedia falló con constraints:', constraints, error)
        continue
      }
    }

    throw new Error('No se pudo acceder a cámara/micrófono con ninguna configuración')
  }

  /**
   * Attempt getUserMedia with exponential backoff retry
   */
  private static async attemptGetUserMedia(
    constraints: MediaConstraints,
    config: RetryConfig
  ): Promise<MediaStream> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints)
      } catch (error) {
        lastError = error as Error

        // Don't retry for permission denied or not found errors
        if (error instanceof DOMException) {
          if (error.name === 'NotAllowedError' || error.name === 'NotFoundError') {
            throw error
          }
        }

        if (attempt < config.maxRetries) {
          const delay = Math.min(
            config.initialDelay * Math.pow(config.backoffMultiplier, attempt),
            config.maxDelay
          )

          logger.info(`🔄 Reintentando getUserMedia en ${delay}ms (intento ${attempt + 1}/${config.maxRetries})`)
          await this.delay(delay)
        }
      }
    }

    throw lastError || new Error('getUserMedia falló después de todos los reintentos')
  }

  /**
   * Setup ICE connection monitoring with automatic reconnection
   */
  static setupICEConnectionMonitoring(
    peerConnection: RTCPeerConnection,
    onReconnectNeeded?: () => void
  ): () => void {
    let disconnectedTimer: NodeJS.Timeout | null = null
    let isReconnecting = false

    const handleICEConnectionStateChange = () => {
      const state = peerConnection.iceConnectionState
      logger.info('🔗 ICE Connection State:', state)

      // Clear any existing timer
      if (disconnectedTimer) {
        clearTimeout(disconnectedTimer)
        disconnectedTimer = null
      }

      switch (state) {
        case 'connected':
        case 'completed':
          logger.info('✅ Conexión WebRTC establecida')
          isReconnecting = false
          break

        case 'disconnected':
          logger.warn('⚠️ Conexión WebRTC desconectada, esperando reconexión...')
          // Wait 5 seconds before attempting reconnection
          disconnectedTimer = setTimeout(() => {
            if (peerConnection.iceConnectionState === 'disconnected' && !isReconnecting) {
              logger.info('🔄 Iniciando reconexión WebRTC...')
              isReconnecting = true
              onReconnectNeeded?.()
            }
          }, 5000)
          break

        case 'failed':
          logger.error('❌ Conexión WebRTC falló')
          if (!isReconnecting) {
            isReconnecting = true
            onReconnectNeeded?.()
          }
          break

        case 'closed':
          logger.info('🔐 Conexión WebRTC cerrada')
          break
      }
    }

    peerConnection.addEventListener('iceconnectionstatechange', handleICEConnectionStateChange)

    // Return cleanup function
    return () => {
      peerConnection.removeEventListener('iceconnectionstatechange', handleICEConnectionStateChange)
      if (disconnectedTimer) {
        clearTimeout(disconnectedTimer)
      }
    }
  }

  /**
   * Get comprehensive connection statistics
   */
  static async getConnectionStats(peerConnection: RTCPeerConnection): Promise<ConnectionStats> {
    const stats = await peerConnection.getStats()
    let bytesReceived = 0
    let bytesSent = 0
    let packetsReceived = 0
    let packetsSent = 0

    stats.forEach((report) => {
      if (report.type === 'inbound-rtp') {
        bytesReceived += report.bytesReceived || 0
        packetsReceived += report.packetsReceived || 0
      }
      if (report.type === 'outbound-rtp') {
        bytesSent += report.bytesSent || 0
        packetsSent += report.packetsSent || 0
      }
    })

    return {
      bytesReceived,
      bytesSent,
      packetsReceived,
      packetsSent,
      connectionState: peerConnection.connectionState,
      iceConnectionState: peerConnection.iceConnectionState,
      timestamp: Date.now()
    }
  }

  /**
   * Test ICE servers connectivity
   */
  static async testICEServers(iceServers: ICEServerConfig[]): Promise<boolean> {
    try {
      const pc = new RTCPeerConnection({ iceServers })

      // Create a dummy data channel to trigger ICE gathering
      pc.createDataChannel('test')

      // Create offer to start ICE gathering
      await pc.createOffer()

      return new Promise((resolve) => {
        let hasValidCandidate = false

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            logger.info('🧊 ICE Candidate encontrado:', event.candidate.candidate)
            hasValidCandidate = true
          } else {
            // ICE gathering complete
            logger.info('🧊 ICE gathering completado, válido:', hasValidCandidate)
            pc.close()
            resolve(hasValidCandidate)
          }
        }

        // Timeout after 10 seconds
        setTimeout(() => {
          logger.info('⏰ Timeout en test ICE servers')
          pc.close()
          resolve(false)
        }, 10000)
      })
    } catch (error) {
      logger.error('❌ Error testing ICE servers:', error)
      return false
    }
  }

  /**
   * Create ICE server configuration from environment
   */
  static createICEServers(): ICEServerConfig[] {
    const iceServers: ICEServerConfig[] = [
      // Google STUN servers
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]

    // Add TURN servers from environment
    const turnUrls = process.env.NEXT_PUBLIC_TURN_URLS
    const turnUsername = process.env.NEXT_PUBLIC_TURN_USERNAME
    const turnCredential = process.env.NEXT_PUBLIC_TURN_CREDENTIAL

    if (turnUrls && turnUsername && turnCredential) {
      iceServers.push({
        urls: turnUrls.split(','),
        username: turnUsername,
        credential: turnCredential
      })
    }

    return iceServers
  }

  /**
   * Diagnose getUserMedia errors
   */
  static diagnoseGetUserMediaError(error: Error): string {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          return 'Permisos de cámara/micrófono denegados. Por favor, habilita los permisos en tu navegador.'
        case 'NotFoundError':
          return 'No se encontró cámara o micrófono. Verifica que los dispositivos estén conectados.'
        case 'NotReadableError':
          return 'Cámara o micrófono en uso por otra aplicación. Cierra otras apps que puedan estar usándolos.'
        case 'OverconstrainedError':
          return 'La configuración solicitada no es compatible con tu dispositivo.'
        case 'NotSupportedError':
          return 'Tu navegador no soporta acceso a cámara/micrófono.'
        case 'AbortError':
          return 'Acceso a cámara/micrófono fue cancelado.'
        default:
          return `Error de cámara/micrófono: ${error.message}`
      }
    }

    return `Error desconocido: ${error.message}`
  }

  /**
   * Comprehensive media diagnostics
   */
  static async diagnose(): Promise<MediaDiagnostics> {
    logger.info('🔍 Starting WebRTC diagnostics...')

    // Check devices
    const devices = await navigator.mediaDevices.enumerateDevices()
    logger.info('📱 Available devices:', devices.map(d => ({
      kind: d.kind,
      label: d.label || 'Unknown device',
      deviceId: d.deviceId.substring(0, 8) + '...'
    })))

    // Check permissions
    const permissions = {
      camera: await this.checkPermission('camera'),
      microphone: await this.checkPermission('microphone')
    }
    logger.info('🔐 Permissions:', permissions)

    return {
      devices,
      permissions,
      capabilities: {
        video: null,
        audio: null
      }
    }
  }

  /**
   * Check media permission status
   */
  static async checkPermission(name: PermissionName): Promise<PermissionState> {
    try {
      const result = await navigator.permissions.query({ name })
      return result.state
    } catch {
      return 'prompt'
    }
  }

  /**
   * Utility delay function
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// STUN-only defaults. TURN servers are loaded via env vars in @autamedica/telemedicine (getIceServersConfig).
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302'] },
  { urls: ['stun:stun1.l.google.com:19302'] },
]