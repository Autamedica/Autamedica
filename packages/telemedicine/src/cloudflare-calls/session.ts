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

import { createTelemedicineLogger } from '../debug'

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
  errorCode?: string
  errorDescription?: string
}

interface NewTracksResponse {
  requiresImmediateRenegotiation: boolean
  sessionDescription: CFSessionDescription | null
  tracks?: TrackEntry[]
}

export interface CFSessionConfig {
  /** URL del proxy API en el app (e.g., /api/cloudflare-calls) */
  apiProxyUrl: string
  /** Server-verified room scope for every SFU operation. */
  roomId: string
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
  /**
   * True once `connect()` has fully resolved (sessions/new answered, remote SDP
   * applied and initial tracks/new completed). Gates external track operations
   * that would otherwise race with the initial negotiation and hit either the
   * "no conectado aún" guard (ASTRO-B/C) or Cloudflare's
   * invalid_session_description 406 (ASTRO-D) because the PC is still in
   * `have-local-offer`.
   */
  private ready = false
  private closed = false
  /**
   * Called synchronously for every `track` event BEFORE the app-level onTrack
   * handler. Set by subscribeToSession so midToUserId in the client gets
   * populated before handleRemoteTrack runs (ontrack fires during
   * setRemoteDescription inside renegotiate — if we only populated the map
   * after subscribeToSession returned, the race would be unwinnable).
   */
  private preTrackHandler: ((mid: string, kind: string) => void) | null = null
  private readonly debugLogger = createTelemedicineLogger({ source: 'CloudflareCallsSession' })

  constructor(config: CFSessionConfig) {
    this.cfg = config
  }

  /**
   * Publica los tracks locales del stream en Cloudflare y establece la conexión.
   * @returns El CF session ID que debe compartirse con el peer remoto.
   */
  async connect(localStream: MediaStream): Promise<string> {
    const defaultIceServers: RTCIceServer[] = [
      { urls: 'stun:stun.cloudflare.com:3478' },
      { urls: 'stun:stun.l.google.com:19302' },
    ]
    const effectiveIceServers = (this.cfg.iceServers && this.cfg.iceServers.length > 0)
      ? this.cfg.iceServers
      : defaultIceServers
    this.pc = new RTCPeerConnection({ iceServers: effectiveIceServers })

    // Pre-handler MUST be registered before cfg.onTrack so it runs first
    // (Chrome dispatches listeners in addEventListener order).
    this.pc.addEventListener('track', (event) => {
      const mid = event.transceiver?.mid
      if (mid && this.preTrackHandler) {
        this.preTrackHandler(mid, event.track.kind)
      }
    })
    this.pc.addEventListener('track', this.cfg.onTrack)
    this.pc.addEventListener('connectionstatechange', () => {
      if (this.pc) this.cfg.onConnectionStateChange(this.pc.connectionState)
    })
    this.pc.addEventListener('icecandidateerror', (ev) => {
      // Loguear pero no bloquear: CF SFU incluye todos los candidates en el SDP (Full ICE)
      const e = ev as RTCPeerConnectionIceErrorEvent
      this.debugLogger.warn('ICE candidate error (non-fatal, ignored)', {
        errorCode: e.errorCode,
        errorText: e.errorText,
        url: e.url,
      })
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
    } else {
      // Without a remote answer the PC stays in `have-local-offer`. Any
      // subsequent tracks/new call would be rejected by Cloudflare with
      // `invalid_session_description` (ASTRO-D). Bail early so the caller
      // surfaces a clean error instead of a confusing 406.
      throw new Error(
        'CloudflareCallsSession: sessions/new did not return a remote sessionDescription'
      )
    }

    // Esperar a que la PeerConnection con Cloudflare SFU esté conectada (DTLS + ICE)
    // ANTES de llamar a tracks/new. Cloudflare Calls rechaza tracks/new con 425 si no está conectada.
    await this.waitForMediaConnection()

    // 2. Publicar los tracks locales con nombres canónicos (audio0, video0).
    // Include every sendonly transceiver — even the ones without a track yet —
    // so the SFU binds the canonical slot now; later replaceTrack() calls will
    // start flowing media without needing a fresh tracks/new registration.
    const transceivers = this.pc.getTransceivers()
    const localTracks: TrackEntry[] = transceivers
      .filter((t) => t.direction === 'sendonly')
      .map((t) => {
        // The receiver track always exists and accurately reflects the transceiver's media type,
        // even if the sender has no track currently attached (e.g. camera disabled).
        const kind = t.receiver.track.kind
        return {
          location: 'local' as const,
          mid: t.mid ?? undefined,
          trackName: `${kind}0`,
        }
      })

    this.debugLogger.info('SFU local tracks registered', { sessionId, tracks: localTracks })

    if (localTracks.length > 0) {
      await this.enqueueNegotiation(async () => {
        await this.waitForStableSignaling()
        let result: NewTracksResponse | null = null
        const MAX_PUBLISH_ATTEMPTS = 3
        for (let attempt = 0; attempt < MAX_PUBLISH_ATTEMPTS; attempt++) {
          try {
            result = await this.cfApi<NewTracksResponse>(
              'POST',
              `sessions/${sessionId}/tracks/new`,
              { tracks: localTracks }
            )
            break
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : String(err)
            const is425 = errMsg.includes('425') || errMsg.includes('Session is not ready')
            if (is425 && attempt < MAX_PUBLISH_ATTEMPTS - 1) {
              await new Promise((r) => setTimeout(r, (attempt + 1) * 800))
              continue
            }
            throw err
          }
        }
        if (result && result.requiresImmediateRenegotiation && result.sessionDescription) {
          await this.renegotiate(result.sessionDescription)
        }
      })
    }

    this.ready = true
    return sessionId
  }

  /** Read-only diagnostics; never expose the mutable peer connection. */
  get connectionState(): RTCPeerConnectionState {
    return this.pc?.connectionState ?? 'closed'
  }

  async getStats(): Promise<RTCStatsReport> {
    if (!this.pc) throw new Error('SFU stats unavailable before connection')
    return this.pc.getStats()
  }

  /** True once connect() finished and the SFU session is usable. */
  isReady(): boolean {
    return this.ready && !this.closed && this.pc !== null && this.sessionId !== null
  }

  /**
   * Suscribe a los tracks de una sesión remota (audio0 + video0).
   * Llamar una vez por peer remoto que se desee ver/oír.
   */
  async subscribeToSession(
    remoteSessionId: string,
    onTrackMid?: (mid: string, kind: string) => void,
  ): Promise<TrackEntry[]> {
    if (this.closed) {
      // Session was torn down (user navigated away, disconnect() already ran)
      // while a signaling message was still in flight. Returning an empty
      // result is the only sane thing here. This is an expected lifecycle
      // race, not a transport failure: reporting it through onError makes
      // CloudflareCallsClient emit a fatal UI error and can restart a call
      // that is already being cleaned up.
      this.debugLogger.info('Subscribe ignored after session close')
      return []
    }
    if (!this.pc || !this.sessionId || !this.ready) {
      // The initial negotiation hasn't finished yet. The client layer is
      // supposed to queue remote sessions via pendingRemoteSessionIds and
      // drain them after connect() resolves, so reaching this branch means a
      // caller didn't guard with isReady(). Throw so the bug is visible in
      // dev, but include enough state for the Sentry breadcrumb to be useful.
      throw new Error(
        `CloudflareCallsSession: no conectado aún (ready=${this.ready}, hasPc=${!!this.pc}, hasSession=${!!this.sessionId})`
      )
    }

    const remoteTracks: TrackEntry[] = [
      { location: 'remote', trackName: 'audio0', sessionId: remoteSessionId },
      { location: 'remote', trackName: 'video0', sessionId: remoteSessionId },
    ]

    const pc = this.pc
    const priorMids = new Set(
      pc.getTransceivers().map((t) => t.mid).filter((m): m is string => m !== null)
    )

    // Install pre-handler so midToUserId is populated BEFORE the app's onTrack
    // runs (ontrack fires during setRemoteDescription inside renegotiate).
    if (onTrackMid) {
      this.preTrackHandler = onTrackMid
    }

    let pulledTracks: TrackEntry[] = []
    try {
      await this.enqueueNegotiation(async () => {
        // Guard against calling tracks/new while the PC is still mid-renegotiation
        // from a previous enqueued op. Cloudflare rejects with 406
        // invalid_session_description when the signaling state is not `stable`
        // (ASTRO-D).
        await this.waitForStableSignaling()
        let result: NewTracksResponse | null = null
        // El peer Android puede demorar entre 5 y 8 segundos en inicializar la cámara (Camera2 API)
        // y comenzar a enviar paquetes RTP. Cloudflare Calls rechazará la suscripción hasta
        // que haya flujo real de paquetes. Incrementamos significativamente la ventana de espera (aprox 12-15s).
        const MAX_SUBSCRIBE_RETRIES = 15
        let attempt = 0

        while (attempt < MAX_SUBSCRIBE_RETRIES) {
          try {
            result = await this.cfApi<NewTracksResponse>(
              'POST',
              `sessions/${this.sessionId}/tracks/new`,
              { tracks: remoteTracks }
            )
            const hasNotFoundError = (result?.tracks ?? []).some(
              (t) => t.errorCode === 'not_found_track_error'
            )
            if (hasNotFoundError && attempt < MAX_SUBSCRIBE_RETRIES - 1) {
              attempt++
              await new Promise((r) => setTimeout(r, 1500))
              continue
            }
            break
          } catch (err: unknown) {
            attempt++
            const errMsg = err instanceof Error ? err.message : String(err)
            const isNotFoundError = errMsg.includes('not_found_track_error') ||
                                    errMsg.includes('404')
            if (isNotFoundError && attempt < MAX_SUBSCRIBE_RETRIES) {
              await new Promise((r) => setTimeout(r, 1500))
              continue
            }
            throw err
          }
        }

        this.debugLogger.info('SFU track subscribe response', {
          remoteSessionId,
          requiresImmediateRenegotiation: result?.requiresImmediateRenegotiation,
          hasSessionDescription: !!result?.sessionDescription,
          tracks: result?.tracks,
          attempt,
        })

        if (result && result.requiresImmediateRenegotiation && result.sessionDescription) {
          await this.renegotiate(result.sessionDescription)
        }

        const newTransceivers = pc
          .getTransceivers()
          .filter((t) => t.mid && !priorMids.has(t.mid) && t.direction === 'recvonly')

        this.debugLogger.info('SFU new recv transceivers', {
          remoteSessionId,
          mids: newTransceivers.map((t) => ({
            mid: t.mid,
            kind: t.receiver?.track?.kind,
            direction: t.direction,
          })),
        })

        // Observability: distinguish a peer that published its session fine (new
        // transceivers attached) from an "empty" subscribe — the peer announced its
        // cf-session before its local tracks/new finished, so the SFU had nothing to
        // pull and no transceiver was created. Caller retries (bounded) once live.
        if (newTransceivers.length === 0 && !result.requiresImmediateRenegotiation) {
          this.debugLogger.warn(
            'Remote subscribe returned no tracks (peer announced before publishing?)',
            {
              remoteSessionId,
              requiresImmediateRenegotiation: result.requiresImmediateRenegotiation,
              hasSessionDescription: !!result.sessionDescription,
            }
          )
        }

        // Backstop: if any transceiver fired ontrack before its mid was stable,
        // the pre-handler still covers the common path, but we re-emit here too
        // so the caller can reconcile.
        if (onTrackMid) {
          for (const t of newTransceivers) {
            if (t.mid) onTrackMid(t.mid, t.receiver.track?.kind ?? 'audio')
          }
        }

        pulledTracks = newTransceivers.map((t) => ({
          location: 'remote' as const,
          trackName: `${t.receiver.track?.kind ?? 'audio'}0`,
          mid: t.mid ?? undefined,
          sessionId: remoteSessionId,
        }))
      })
    } finally {
      this.preTrackHandler = null
    }

    this.debugLogger.info('SFU subscribe result', { remoteSessionId, pulledTracks })

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

  /**
   * Resolves once the RTCPeerConnection is back in `stable` (no pending
   * offer/answer in either direction). Called before every tracks/new so we
   * never hit Cloudflare's `invalid_session_description` 406 — the SFU rejects
   * the call whenever the client is still expecting a remote answer for a
   * previous renegotiation (ASTRO-D).
   */
  private waitForStableSignaling(timeoutMs = 5000): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.pc || this.pc.signalingState === 'stable') {
        resolve()
        return
      }
      const pc = this.pc
      const timeout = setTimeout(() => {
        pc.removeEventListener('signalingstatechange', onChange)
        // Best-effort: resolve even on timeout so we don't deadlock the queue.
        // If the state never becomes stable, cfApi will surface the real error.
        resolve()
      }, timeoutMs)
      const onChange = () => {
        if (pc.signalingState === 'stable') {
          clearTimeout(timeout)
          pc.removeEventListener('signalingstatechange', onChange)
          resolve()
        }
      }
      pc.addEventListener('signalingstatechange', onChange)
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

  /** Espera que la conexión WebRTC con Cloudflare SFU esté conectada */
  private waitForMediaConnection(timeoutMs = 10000): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.pc || this.pc.connectionState === 'connected') {
        resolve()
        return
      }
      const pc = this.pc
      const timeout = setTimeout(() => {
        pc.removeEventListener('connectionstatechange', onStateChange)
        this.debugLogger.warn('waitForMediaConnection timed out before connected state', { state: pc.connectionState })
        resolve() // Best-effort: no bloquear si tarda
      }, timeoutMs)
      const onStateChange = () => {
        if (pc.connectionState === 'connected') {
          clearTimeout(timeout)
          pc.removeEventListener('connectionstatechange', onStateChange)
          resolve()
        }
      }
      pc.addEventListener('connectionstatechange', onStateChange)
    })
  }

  /** POST al proxy API interno del app */
  private async cfApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.cfg.apiProxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: this.cfg.roomId, method, path, body }),
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

  async close(): Promise<void> {
    // Mark closed FIRST so any in-flight subscribeToSession still resolving
    // in the negotiation queue sees the flag and short-circuits instead of
    // hitting the "no conectado aún" throw (ASTRO-B/C reproduced when a
    // cf-session signaling message was processed just as the user left the
    // /doctors/call page and disconnect() wiped sessionId).
    this.closed = true
    this.ready = false
    // Explicitly close tracks on the Cloudflare Calls side so the SFU releases
    // the slot immediately instead of waiting for the ICE teardown timeout.
    // Without this, other peers observe the track as "alive but silent" for a
    // few seconds after we leave (the "Dead Tracks" pattern reported in
    // https://community.cloudflare.com/t/dead-tracks-high-priority/859160).
    if (this.pc && this.sessionId) {
      const tracks = this.pc
        .getTransceivers()
        .filter((t) => t.mid)
        .map((t) => ({ mid: t.mid as string }))
      if (tracks.length > 0) {
        try {
          await this.cfApi('PUT', `sessions/${this.sessionId}/tracks/close`, {
            tracks,
            force: true,
          })
        } catch {
          // Best-effort: Cloudflare will garbage-collect the session when ICE
          // disconnects anyway; we just wanted to accelerate it.
        }
      }
    }
    this.pc?.close()
    this.pc = null
    this.sessionId = null
    this.localVideoSender = null
    this.localAudioSender = null
  }
}

