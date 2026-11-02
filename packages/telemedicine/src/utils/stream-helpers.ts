import type { StreamQualitySummary } from '../webrtc-client'

export function hasRemoteVideoEvidence(summary: StreamQualitySummary): boolean {
  return summary.peers.some((peer) => {
    const inboundVideo = peer.inboundVideoBitrateKbps ?? 0
    const fps = peer.framesPerSecond ?? 0
    const width = peer.frameWidth ?? 0
    const height = peer.frameHeight ?? 0

    return inboundVideo >= 150 || fps >= 8 || (width >= 160 && height >= 120)
  })
}

export function hasRemoteMediaEvidence(summary: StreamQualitySummary): boolean {
  return hasRemoteVideoEvidence(summary) || summary.peers.some((peer) => (peer.inboundAudioBitrateKbps ?? 0) > 0)
}

