/**
 * CloudflareCallsSession
 *
 * Gestiona la conexión WebRTC de UN peer con el SFU de Cloudflare Calls.
 * Cada participante crea su propia sesión, publica sus tracks locales y
 * se subscribe a los tracks de los peers remotos.
 *
 * Diagrama de flujo:
 *   browser ──(WebRTC)──▶ Cloudflare Calls SFU ◀──(WebRTC)── browser
 *   (peer A)                     (relay)                    (peer B)
 */

export interface CFSessionDescription {
  type: 'offer' | 'answer'
  sdp: string
}

interface NewSessionResponse {
  sessionId: string
  sessionDescription: CFSessionDescription | null
}

export interface TrackEntry {
  location: 'local' | 'remote'
  trackName: string
  mid?: string
  sessionId?: string
}

interface NewTracksResponse {
  requiresImmediateRenegotiation: boolean
  sessionDescription: CFSessionDescription | null
  tracks?: TrackEntry[]
}

export interface CFSessionConfig {
  /** URL del proxy API en el app (e.g., /api/cloudflare-calls) */
  apiProxyUrl: string
  iceServers?: RTCIceServer[]
  onTrack: (event: RTCTrackEvent) => void
  onConnectionStateChange: (state: RTCPeerConnectionState) => void
  onError?: (err: Error) => void
}

export class CloudflareCallsSession {
  private pc: RTCPeerConnection | null = null
  private sessionId: string | null = null
  private localVideoSender: RTCRtpSender | null = null
  private localAudioSender: RTCRtpSender | null = null
  private negotiationQueue: Promise<void> = Promise.resolve()
  private readonly cfg: CFSessionConfig

  constructor(config: CFSessionConfig) {
    this.cfg = config
  }

  /**
   * Publica los tracks locales del stream en Cloudflare y establece la conexión.
   * @returns El CF session ID que debe compartirse con el peer remoto.
   */
  async connect(localStream: MediaStream): Promise<string> {
    // Cloudflare Calls provee sus propios candidatos ICE dentro del SDP.
    // No hace falta configurar ICE servers externos para la conexión al SFU.
    this.pc = new RTCPeerConnection(this.cfg.iceServers ? { iceServers: this.cfg.iceServers } : undefined)

    this.pc.addEventListener('track', this.cfg.onTrack)
    this.pc.addEventListener('connectionstatechange', () => {
      if (this.pc) this.cfg.onConnectionStateChange(this.pc.connectionState)
    })
    this.pc.addEventListener('icecandidateerror', (ev) => {
      // Loguear pero no bloquear: CF SFU incluye todos los candidates en el SDP
      const e = ev as RTCPeerConnectionIceErrorEvent
      this.cfg.onError?.(new Error(`ICE candidate error ${e.errorCode}: ${e.errorText}`))
    })

    // Añadir tracks locales como sendonly para publicarlos
    for (const track of localStream.getTracks()) {
      const transceiver = this.pc.addTransceiver(track, { direction: 'sendonly' })
      if (track.kind === 'video') {
        this.localVideoSender = transceiver.sender
      } else if (track.kind === 'audio') {
        this.localAudioSender = transceiver.sender
      }
    }

    // Ensure both audio and video senders exist even if the initial stream is
    // missing one kind (e.g. camera/mic denied, warmUp fell back to audio-only).
    // Without a pre-created transceiver, replaceTrack() later becomes a no-op
    // because there is no sender to replace on, so turning the camera ON
    // mid-call would never publish the new track to the SFU.
    if (!this.localVideoSender) {
      const videoTransceiver = this.pc.addTransceiver('video', { direction: 'sendonly' })
      this.localVideoSender = videoTransceiver.sender
    }
    if (!this.localAudioSender) {
      const audioTransceiver = this.pc.addTransceiver('audio', { direction: 'sendonly' })
      this.localAudioSender = audioTransceiver.sender
    }

    // Crear oferta SDP con todos los transceivers locales
    const offer = await this.pc.createOffer()
    await this.pc.setLocalDescription(offer)

    // Esperar fin de ICE gathering (CF usa full ICE, no trickle)
    await this.waitForIceGathering()

    // 1. Crear sesión en Cloudflare con la oferta local
    const { sessionId, sessionDescription } = await this.cfApi<NewSessionResponse>(
      'POST',
      'sessions/new',
      { sessionDescription: { type: 'offer', sdp: this.pc.localDescription?.sdp ?? '' } }
    )
    this.sessionId = sessionId

    if (sessionDescription && this.pc) {
      await this.pc.setRemoteDescription(sessionDescription)
    }

    // 2. Publicar los tracks locales con nombres canónicos (audio0, video0).
    // Include every sendonly transceiver — even the ones without a track yet —
    // so the SFU binds the canonical slot now; later replaceTrack() calls will
    // start flowing media without needing a fresh tracks/new registration.
    const transceivers = this.pc.getTransceivers()
    const localTracks: TrackEntry[] = transceivers
      .filter((t) => t.direction === 'sendonly')
      .map((t) => {
        const kind = t.sender.track?.kind ?? t.receiver.track?.kind ?? 'audio'
        return {
          location: 'local' as const,
          mid: t.mid ?? undefined,
          trackName: `${kind}0`,
        }
      })

    if (localTracks.length > 0) {
      await this.enqueueNegotiation(async () => {
        const result = await this.cfApi<NewTracksResponse>(
          'POST',
          `sessions/${sessionId}/tracks/new`,
          { tracks: localTracks }
        )
        if (result.requiresImmediateRenegotiation && result.sessionDescription) {
          await this.renegotiate(result.sessionDescription)
        }
      })
    }

    return sessionId
  }

  /**
   * Suscribe a los tracks de una sesión remota (audio0 + video0).
   * Llamar una vez por peer remoto que se desee ver/oír.
   */
  async subscribeToSession(remoteSessionId: string): Promise<TrackEntry[]> {
    if (!this.pc || !this.sessionId) {
      throw new Error('CloudflareCallsSession: no conectado aún')
    }

    const remoteTracks: TrackEntry[] = [
      { location: 'remote', trackName: 'audio0', sessionId: remoteSessionId },
      { location: 'remote', trackName: 'video0', sessionId: remoteSessionId },
    ]

    let pulledTracks: TrackEntry[] = []
    await this.enqueueNegotiation(async () => {
      const result = await this.cfApi<NewTracksResponse>(
        'POST',
        `sessions/${this.sessionId}/tracks/new`,
        { tracks: remoteTracks }
      )
      pulledTracks = result.tracks ?? []

      if (result.requiresImmediateRenegotiation && result.sessionDescription) {
        await this.renegotiate(result.sessionDescription)
      }
    })

    return pulledTracks
  }

  /** Ensures API track modifications and renegotiations happen sequentially */
  private enqueueNegotiation<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.negotiationQueue = this.negotiationQueue.then(async () => {
        try {
          resolve(await operation())
        } catch (err) {
          reject(err)
        }
      })
    })
  }

  /** Procesa una re-negociación iniciada por Cloudflare (nuevo offer → answer) */
  private async renegotiate(newOffer: CFSessionDescription): Promise<void> {
    if (!this.pc || !this.sessionId) return

    await this.pc.setRemoteDescription(newOffer)
    const answer = await this.pc.createAnswer()
    await this.pc.setLocalDescription(answer)

    await this.cfApi('PUT', `sessions/${this.sessionId}/renegotiate`, {
      sessionDescription: { type: 'answer', sdp: answer.sdp },
    })
  }

  /** Espera que el ICE gathering termine o expire el timeout (4s) */
  private waitForIceGathering(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.pc || this.pc.iceGatheringState === 'complete') {
        resolve()
        return
      }
      const timeout = setTimeout(resolve, 10000)
      const onStateChange = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          clearTimeout(timeout)
          this.pc.removeEventListener('icegatheringstatechange', onStateChange)
          resolve()
        }
      }
      this.pc.addEventListener('icegatheringstatechange', onStateChange)
    })
  }

  /** POST al proxy API interno del app */
  private async cfApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.cfg.apiProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, path, body }),
    })
    if (!res.ok) {
      let detail = ''
      try {
        const json = await res.json()
        detail = JSON.stringify(json)
      } catch {
        detail = await res.text()
      }
      const err = new Error(`Cloudflare Calls error ${res.status} (${path}): ${detail}`)
      this.cfg.onError?.(err)
      throw err
    }
    return res.json() as Promise<T>
  }

  getSessionId(): string | null {
    return this.sessionId
  }

  async replacePublishedVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    await this.localVideoSender?.replaceTrack(track)
  }

  async replacePublishedAudioTrack(track: MediaStreamTrack | null): Promise<void> {
    await this.localAudioSender?.replaceTrack(track)
  }

  close(): void {
    this.pc?.close()
    this.pc = null
    this.sessionId = null
    this.localVideoSender = null
    this.localAudioSender = null
  }
}
