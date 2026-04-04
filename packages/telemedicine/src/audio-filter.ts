/**
 * AudioFilterProcessor — 3-band parametric EQ for microphone audio.
 *
 * Inserts Web Audio API BiquadFilter nodes between the raw mic stream
 * and the MediaStream sent to peer connections.
 *
 * Chain: micStream → source → lowShelf → midPeaking → highShelf → destination → processedStream
 *
 * Medical rationale:
 * - Low band  (-50 dB): eliminates room rumble, AC hum, traffic noise
 * - Mid band  (  0 dB): preserves voice fundamentals (300 Hz – 3 kHz)
 * - High band (  0 dB): preserves consonant clarity (sibilants, breath sounds)
 */

import type { createTelemedicineLogger } from './debug'

export interface AudioFilterBand {
  /** Gain in dB. Negative = cut, positive = boost. */
  gain: number
  /** Center/cutoff frequency in Hz. */
  frequency: number
}

export interface AudioFilterConfig {
  low: AudioFilterBand
  mid: AudioFilterBand
  high: AudioFilterBand
}

export const DEFAULT_AUDIO_FILTER: AudioFilterConfig = {
  low:  { gain: -50, frequency: 300 },
  mid:  { gain: 0,   frequency: 1500 },
  high: { gain: 0,   frequency: 6000 },
}

export class AudioFilterProcessor {
  private context: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private destination: MediaStreamAudioDestinationNode | null = null
  private lowFilter: BiquadFilterNode | null = null
  private midFilter: BiquadFilterNode | null = null
  private highFilter: BiquadFilterNode | null = null
  private _enabled = false
  private config: AudioFilterConfig

  constructor(
    private readonly logger: ReturnType<typeof createTelemedicineLogger> | null,
    config?: Partial<AudioFilterConfig>,
  ) {
    this.config = {
      low:  { ...DEFAULT_AUDIO_FILTER.low,  ...config?.low },
      mid:  { ...DEFAULT_AUDIO_FILTER.mid,  ...config?.mid },
      high: { ...DEFAULT_AUDIO_FILTER.high, ...config?.high },
    }
  }

  get enabled(): boolean {
    return this._enabled
  }

  /**
   * Process a raw microphone stream through the 3-band EQ.
   * Returns a new MediaStream with the processed audio track + original video tracks.
   */
  process(rawStream: MediaStream): MediaStream {
    const audioTrack = rawStream.getAudioTracks()[0]
    if (!audioTrack) return rawStream

    try {
      this.teardownAudioGraph()

      this.context = new AudioContext({ sampleRate: 48000 })
      this.source = this.context.createMediaStreamSource(new MediaStream([audioTrack]))
      this.destination = this.context.createMediaStreamDestination()

      // Low shelf: cut everything below cutoff
      this.lowFilter = this.context.createBiquadFilter()
      this.lowFilter.type = 'lowshelf'
      this.lowFilter.frequency.value = this.config.low.frequency
      this.lowFilter.gain.value = this.config.low.gain

      // Mid peaking: boost/cut around center frequency
      this.midFilter = this.context.createBiquadFilter()
      this.midFilter.type = 'peaking'
      this.midFilter.frequency.value = this.config.mid.frequency
      this.midFilter.Q.value = 1.0
      this.midFilter.gain.value = this.config.mid.gain

      // High shelf: boost/cut everything above cutoff
      this.highFilter = this.context.createBiquadFilter()
      this.highFilter.type = 'highshelf'
      this.highFilter.frequency.value = this.config.high.frequency
      this.highFilter.gain.value = this.config.high.gain

      // Chain: source → low → mid → high → destination
      this.source.connect(this.lowFilter)
      this.lowFilter.connect(this.midFilter)
      this.midFilter.connect(this.highFilter)
      this.highFilter.connect(this.destination)

      this._enabled = true
      this.logger?.info('Audio filter enabled', {
        low: `${this.config.low.gain}dB @ ${this.config.low.frequency}Hz`,
        mid: `${this.config.mid.gain}dB @ ${this.config.mid.frequency}Hz`,
        high: `${this.config.high.gain}dB @ ${this.config.high.frequency}Hz`,
      })

      // Build output: processed audio + original video tracks
      const processedStream = new MediaStream()
      for (const track of this.destination.stream.getAudioTracks()) {
        processedStream.addTrack(track)
      }
      for (const track of rawStream.getVideoTracks()) {
        processedStream.addTrack(track)
      }

      return processedStream
    } catch (err) {
      this.logger?.error('Audio filter initialization failed, using raw stream', err)
      this.teardownAudioGraph()
      return rawStream
    }
  }

  /** Update a band's gain in real time (no re-capture needed). */
  setBandGain(band: 'low' | 'mid' | 'high', gainDb: number): void {
    const filter = band === 'low' ? this.lowFilter
      : band === 'mid' ? this.midFilter
      : this.highFilter

    if (filter) {
      filter.gain.setValueAtTime(gainDb, this.context?.currentTime ?? 0)
      this.config[band].gain = gainDb
      this.logger?.info('Audio filter band updated', { band, gainDb })
    }
  }

  /** Update all bands at once. */
  setConfig(config: Partial<AudioFilterConfig>): void {
    if (config.low?.gain !== undefined) this.setBandGain('low', config.low.gain)
    if (config.mid?.gain !== undefined) this.setBandGain('mid', config.mid.gain)
    if (config.high?.gain !== undefined) this.setBandGain('high', config.high.gain)

    if (config.low?.frequency !== undefined && this.lowFilter) {
      this.lowFilter.frequency.setValueAtTime(config.low.frequency, this.context?.currentTime ?? 0)
      this.config.low.frequency = config.low.frequency
    }
    if (config.mid?.frequency !== undefined && this.midFilter) {
      this.midFilter.frequency.setValueAtTime(config.mid.frequency, this.context?.currentTime ?? 0)
      this.config.mid.frequency = config.mid.frequency
    }
    if (config.high?.frequency !== undefined && this.highFilter) {
      this.highFilter.frequency.setValueAtTime(config.high.frequency, this.context?.currentTime ?? 0)
      this.config.high.frequency = config.high.frequency
    }
  }

  getConfig(): AudioFilterConfig {
    return { ...this.config }
  }

  private teardownAudioGraph(): void {
    try {
      this.source?.disconnect()
      this.lowFilter?.disconnect()
      this.midFilter?.disconnect()
      this.highFilter?.disconnect()
    } catch { /* already disconnected */ }

    if (this.context?.state !== 'closed') {
      this.context?.close().catch(() => {})
    }

    this.source = null
    this.lowFilter = null
    this.midFilter = null
    this.highFilter = null
    this.destination = null
    this.context = null
    this._enabled = false
  }

  destroy(): void {
    this.teardownAudioGraph()
    this.logger?.info('Audio filter destroyed')
  }
}
