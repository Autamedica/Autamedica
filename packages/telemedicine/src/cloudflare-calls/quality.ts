import { QualityMonitor, type QualityStatsSource } from '../quality-monitor'
import type { WebRTCEvents } from '../providers/types'
import { createTelemedicineLogger } from '../debug'

type QualityEvent = 'stream-quality' | 'quality-report' | 'call-quality-summary'
type EmitQuality = <E extends QualityEvent>(
  event: E,
  ...args: Parameters<WebRTCEvents[E]>
) => void

/** One aggregate transport per browser, not one transport per remote participant. */
export class SfuQualityMonitor {
  private readonly monitor: QualityMonitor
  private stopped = false

  constructor(
    roomId: string,
    session: QualityStatsSource,
    private readonly emit: EmitQuality
  ) {
    this.monitor = new QualityMonitor({
      roomId,
      logger: createTelemedicineLogger({ source: 'SfuQualityMonitor', roomId }),
    })
    this.monitor.onQualitySummary = (summary) => emit('stream-quality', summary)
    this.monitor.onQualityReport = (metrics) => emit('quality-report', metrics)
    this.monitor.start(new Map([['sfu', { pc: session }]]))
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.monitor.stop()
    this.emit('call-quality-summary', this.monitor.getCallSummary())
    this.monitor.clearState()
  }
}
