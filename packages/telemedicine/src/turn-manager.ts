/**
 * TurnManager — handles periodic TURN credential refresh for long-running calls.
 * Extracted from WebRTCClient to isolate TURN credential lifecycle.
 */

import { fetchTurnCredentials, hasTurnIceServer } from './config/ice-servers'
import type { createTelemedicineLogger } from './debug'

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000 // Every 6 hours

export class TurnManager {
  private turnRefreshInterval: ReturnType<typeof setInterval> | null = null

  constructor(
    private readonly logger: ReturnType<typeof createTelemedicineLogger>,
    private readonly sessionId: string,
  ) {}

  private logInfo(message: string, context: Record<string, unknown> = {}): void {
    this.logger.info(message, { sessionId: this.sessionId, ...context })
  }

  private logWarn(message: string, context: Record<string, unknown> = {}): void {
    this.logger.warn(message, { sessionId: this.sessionId, ...context })
  }

  /** Refresh TURN credentials mid-call (Cloudflare credentials expire in 24h) */
  startTurnCredentialRefresh(
    iceServers: RTCIceServer[],
    onRefreshed: (freshServers: RTCIceServer[]) => void,
  ): void {
    if (this.turnRefreshInterval) return
    if (!hasTurnIceServer(iceServers)) return

    this.turnRefreshInterval = setInterval(async () => {
      try {
        const freshServers = await fetchTurnCredentials()
        if (hasTurnIceServer(freshServers)) {
          onRefreshed(freshServers)
          this.logInfo('TURN credentials refreshed')
        }
      } catch {
        this.logWarn('Failed to refresh TURN credentials')
      }
    }, REFRESH_INTERVAL_MS)
  }

  stopTurnCredentialRefresh(): void {
    if (this.turnRefreshInterval) {
      clearInterval(this.turnRefreshInterval)
      this.turnRefreshInterval = null
    }
  }
}
