/**
 * AutoDegradeService — Monitors call quality and auto-switches to audio-only
 * when quality is poor for a sustained period.
 */

import type { StreamQualityLevel } from './types'

export interface AutoDegradeConfig {
  /** How long quality must be 'poor' before auto-degrading (ms). Default: 30000 */
  poorQualityThresholdMs: number
  /** How long quality must be 'good'+ before notifying recovery (ms). Default: 15000 */
  recoveryThresholdMs: number
  onDegrade: (level: 'audio-only') => void
  onRecover: () => void
}

const DEFAULT_CONFIG: Pick<AutoDegradeConfig, 'poorQualityThresholdMs' | 'recoveryThresholdMs'> = {
  poorQualityThresholdMs: 30_000,
  recoveryThresholdMs: 15_000,
}

export class AutoDegradeService {
  private config: AutoDegradeConfig
  private degradedAt: number | null = null
  private recoveredAt: number | null = null
  private _isAutoDegraded = false
  private checkInterval: ReturnType<typeof setInterval> | null = null
  private lastLevel: StreamQualityLevel = 'unknown'
  private poorSince: number | null = null
  private goodSince: number | null = null

  constructor(config: Partial<AutoDegradeConfig> & Pick<AutoDegradeConfig, 'onDegrade' | 'onRecover'>) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  get isAutoDegraded(): boolean {
    return this._isAutoDegraded
  }

  /**
   * Feed a quality level update. Call this every time the quality monitor emits.
   */
  update(level: StreamQualityLevel): void {
    this.lastLevel = level
    const now = Date.now()

    if (level === 'poor') {
      // Reset recovery tracking
      this.goodSince = null

      if (!this.poorSince) {
        this.poorSince = now
      }

      // Check if we should degrade
      if (!this._isAutoDegraded && (now - this.poorSince) >= this.config.poorQualityThresholdMs) {
        this._isAutoDegraded = true
        this.degradedAt = now
        this.config.onDegrade('audio-only')
      }
    } else {
      // Reset poor tracking
      this.poorSince = null

      const isGoodOrBetter = level === 'good' || level === 'excellent'

      if (this._isAutoDegraded && isGoodOrBetter) {
        if (!this.goodSince) {
          this.goodSince = now
        }

        if ((now - this.goodSince) >= this.config.recoveryThresholdMs) {
          this._isAutoDegraded = false
          this.recoveredAt = now
          this.goodSince = null
          this.config.onRecover()
        }
      } else if (!isGoodOrBetter) {
        // fair/unknown — don't count toward recovery
        this.goodSince = null
      }
    }
  }

  reset(): void {
    this._isAutoDegraded = false
    this.degradedAt = null
    this.recoveredAt = null
    this.poorSince = null
    this.goodSince = null
    this.lastLevel = 'unknown'
  }

  dispose(): void {
    this.reset()
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
  }
}
