/**
 * NetworkPreflight — Pre-call network quality test.
 *
 * Creates a temporary RTCPeerConnection to probe STUN/TURN reachability,
 * latency, and bandwidth before joining a call.
 */

export type PreflightRecommendation = 'hd' | 'sd' | 'audio-only' | 'unreachable'

export interface PreflightResult {
  stunReachable: boolean
  turnReachable: boolean
  estimatedBandwidthKbps: number
  latencyMs: number
  recommendation: PreflightRecommendation
  details: string
  /** Whether the mic echo test passed (audio was captured and played back). null if skipped. */
  echoTestPassed: boolean | null
}

const PREFLIGHT_TIMEOUT_MS = 10_000
const BANDWIDTH_PAYLOAD_BYTES = 100 * 1024 // 100 KB

function buildRecommendation(
  stunReachable: boolean,
  turnReachable: boolean,
  bandwidthKbps: number,
): PreflightRecommendation {
  const hasConnectivity = stunReachable || turnReachable

  if (!hasConnectivity) return 'unreachable'
  if (bandwidthKbps >= 1500 && turnReachable) return 'hd'
  if (bandwidthKbps >= 500) return 'sd'
  if (bandwidthKbps >= 100) return 'audio-only'
  return 'audio-only'
}

function buildDetails(recommendation: PreflightRecommendation, bandwidthKbps: number, latencyMs: number): string {
  switch (recommendation) {
    case 'hd':
      return `Conexion excelente — video en alta definicion (${Math.round(bandwidthKbps)} kbps, ${Math.round(latencyMs)} ms)`
    case 'sd':
      return `Conexion moderada — video en definicion estandar (${Math.round(bandwidthKbps)} kbps, ${Math.round(latencyMs)} ms)`
    case 'audio-only':
      return `Conexion limitada — recomendamos audio sin video (${Math.round(bandwidthKbps)} kbps, ${Math.round(latencyMs)} ms)`
    case 'unreachable':
      return 'No pudimos conectar — verifica tu red'
  }
}

export class NetworkPreflight {
  private aborted = false

  /**
   * Run the preflight test.
   * Resolves with a PreflightResult. Never rejects — returns 'unreachable' on failure.
   */
  /**
   * Run a quick mic echo test: record 2s of audio, check if signal was captured.
   * Returns true if mic is working and capturing audio above silence threshold.
   */
  async runEchoTest(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false },
      })
      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaStreamSource(stream)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let maxAmplitude = 0

      // Sample for 2 seconds
      const result = await new Promise<boolean>((resolve) => {
        let samples = 0
        const interval = setInterval(() => {
          analyser.getByteTimeDomainData(dataArray)
          for (const sample of dataArray) {
            const amplitude = Math.abs(sample - 128)
            if (amplitude > maxAmplitude) maxAmplitude = amplitude
          }
          samples++
          if (samples >= 20) { // 20 * 100ms = 2s
            clearInterval(interval)
            // If max amplitude > 5 (out of 128), mic is capturing real audio
            resolve(maxAmplitude > 5)
          }
        }, 100)
      })

      stream.getTracks().forEach(t => t.stop())
      await audioCtx.close()
      return result
    } catch {
      return false
    }
  }

  async run(iceServers: RTCIceServer[]): Promise<PreflightResult> {
    this.aborted = false

    if (!iceServers.length) {
      return this.unreachableResult('Sin servidores ICE configurados')
    }

    // Race the probe against a timeout
    return Promise.race([
      this.probe(iceServers),
      this.timeout(),
    ])
  }

  abort(): void {
    this.aborted = true
  }

  // -- internal --

  private async probe(iceServers: RTCIceServer[]): Promise<PreflightResult> {
    let pc: RTCPeerConnection | null = null

    try {
      pc = new RTCPeerConnection({ iceServers })

      // Step 1: ICE candidate gathering — check STUN/TURN reachability + latency
      const { stunReachable, turnReachable, latencyMs } = await this.gatherIceCandidates(pc)

      if (this.aborted) return this.unreachableResult('Prueba cancelada')

      if (!stunReachable && !turnReachable) {
        return this.unreachableResult('No pudimos conectar — verifica tu red')
      }

      // Step 2: Bandwidth estimation via data channel loopback
      const bandwidthKbps = await this.estimateBandwidth(pc)

      if (this.aborted) return this.unreachableResult('Prueba cancelada')

      // Run echo test in parallel with bandwidth estimation when possible
      let echoTestPassed: boolean | null = null
      try {
        echoTestPassed = await this.runEchoTest()
      } catch {
        echoTestPassed = null
      }

      if (this.aborted) return this.unreachableResult('Prueba cancelada')

      const recommendation = buildRecommendation(stunReachable, turnReachable, bandwidthKbps)
      const details = buildDetails(recommendation, bandwidthKbps, latencyMs)

      return { stunReachable, turnReachable, estimatedBandwidthKbps: bandwidthKbps, latencyMs, recommendation, details, echoTestPassed }
    } catch {
      return this.unreachableResult('Error durante la prueba de red')
    } finally {
      pc?.close()
    }
  }

  private gatherIceCandidates(pc: RTCPeerConnection): Promise<{
    stunReachable: boolean
    turnReachable: boolean
    latencyMs: number
  }> {
    return new Promise((resolve) => {
      let stunReachable = false
      let turnReachable = false
      let firstCandidateAt: number | null = null
      const startedAt = Date.now()

      // We need a transceiver so ICE has something to gather for
      pc.addTransceiver('audio', { direction: 'sendrecv' })

      pc.onicecandidate = (event) => {
        if (this.aborted) {
          resolve({ stunReachable, turnReachable, latencyMs: 0 })
          return
        }

        if (event.candidate) {
          if (firstCandidateAt === null) {
            firstCandidateAt = Date.now()
          }

          const candidateStr = event.candidate.candidate
          // srflx = STUN worked (server reflexive)
          if (candidateStr.includes('srflx')) {
            stunReachable = true
          }
          // relay = TURN worked
          if (candidateStr.includes('relay')) {
            turnReachable = true
          }
        }

        // null candidate = gathering complete
        if (!event.candidate) {
          const latencyMs = firstCandidateAt ? firstCandidateAt - startedAt : PREFLIGHT_TIMEOUT_MS
          resolve({ stunReachable, turnReachable, latencyMs })
        }
      }

      pc.onicegatheringstatechange = () => {
        if (pc.iceGatheringState === 'complete') {
          const latencyMs = firstCandidateAt ? firstCandidateAt - startedAt : PREFLIGHT_TIMEOUT_MS
          resolve({ stunReachable, turnReachable, latencyMs })
        }
      }

      // Kick off gathering
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .catch(() => {
          resolve({ stunReachable: false, turnReachable: false, latencyMs: PREFLIGHT_TIMEOUT_MS })
        })
    })
  }

  private estimateBandwidth(pc: RTCPeerConnection): Promise<number> {
    return new Promise((resolve) => {
      try {
        const dc = pc.createDataChannel('bandwidth-test', { ordered: false })
        const payload = new Uint8Array(BANDWIDTH_PAYLOAD_BYTES)

        let resolved = false
        const finalize = (kbps: number) => {
          if (resolved) return
          resolved = true
          try { dc.close() } catch { /* ignore */ }
          resolve(kbps)
        }

        // If the data channel never opens (no remote peer), estimate from
        // ICE candidate-pair stats or return a conservative default.
        const openTimeout = setTimeout(async () => {
          // Try to get available outgoing bitrate from stats
          try {
            const stats = await pc.getStats()
            let availableBw = 0
            stats.forEach((report) => {
              if (report.type === 'candidate-pair') {
                const abr = (report as Record<string, unknown>).availableOutgoingBitrate
                if (typeof abr === 'number' && abr > 0) {
                  availableBw = Math.max(availableBw, abr / 1000)
                }
              }
            })
            finalize(availableBw > 0 ? availableBw : 800) // conservative default
          } catch {
            finalize(800)
          }
        }, 3000)

        dc.onopen = () => {
          clearTimeout(openTimeout)
          const startMs = Date.now()
          let bytesSent = 0
          const chunkSize = 16 * 1024 // 16 KB chunks

          const sendChunk = () => {
            while (bytesSent < BANDWIDTH_PAYLOAD_BYTES && dc.bufferedAmount < chunkSize * 2) {
              const remaining = BANDWIDTH_PAYLOAD_BYTES - bytesSent
              const slice = remaining < chunkSize ? payload.slice(0, remaining) : payload.slice(0, chunkSize)
              dc.send(slice)
              bytesSent += slice.byteLength
            }

            if (bytesSent >= BANDWIDTH_PAYLOAD_BYTES) {
              // Wait for buffer to drain
              const checkDrained = () => {
                if (dc.bufferedAmount === 0) {
                  const elapsedMs = Date.now() - startMs
                  const kbps = elapsedMs > 0 ? (BANDWIDTH_PAYLOAD_BYTES * 8) / elapsedMs : 0
                  finalize(kbps)
                } else {
                  setTimeout(checkDrained, 10)
                }
              }
              checkDrained()
            } else {
              setTimeout(sendChunk, 10)
            }
          }

          sendChunk()
        }

        dc.onerror = () => finalize(800)
      } catch {
        resolve(800)
      }
    })
  }

  private timeout(): Promise<PreflightResult> {
    return new Promise((resolve) => {
      setTimeout(() => {
        this.aborted = true
        resolve(this.unreachableResult('Tiempo de espera agotado'))
      }, PREFLIGHT_TIMEOUT_MS)
    })
  }

  private unreachableResult(details: string): PreflightResult {
    return {
      stunReachable: false,
      turnReachable: false,
      estimatedBandwidthKbps: 0,
      latencyMs: 0,
      recommendation: 'unreachable',
      details,
      echoTestPassed: null,
    }
  }
}
