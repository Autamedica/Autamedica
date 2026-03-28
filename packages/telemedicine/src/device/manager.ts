/**
 * Device management: enumerate, switch, and monitor device changes.
 */

import { getAdaptiveConstraints } from '../media-optimizations'
import type { DeviceInfo } from '../webrtc-client'

interface PeerState {
  pc: RTCPeerConnection
}

interface DeviceManagerContext {
  getLocalStream: () => MediaStream | null
  setLocalStream: (fn: (stream: MediaStream) => void) => void
  getPeerConnections: () => Map<string, PeerState>
  emit: (event: 'local-stream' | 'device-change', data: unknown) => void
  log: {
    info: (msg: string, ctx?: Record<string, unknown>) => void
  }
}

export class DeviceManager {
  private cachedDevices: DeviceInfo[] = []
  private deviceChangeCleanup: (() => void) | null = null
  private readonly ctx: DeviceManagerContext

  constructor(ctx: DeviceManagerContext) {
    this.ctx = ctx
  }

  async enumerateDevices(): Promise<DeviceInfo[]> {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      this.cachedDevices = devices
        .filter((d) => d.kind === 'audioinput' || d.kind === 'videoinput' || d.kind === 'audiooutput')
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `${d.kind} (${d.deviceId.slice(0, 6)})`,
          kind: d.kind as DeviceInfo['kind'],
        }))
      return this.cachedDevices
    } catch {
      return []
    }
  }

  getDevices(): DeviceInfo[] {
    return this.cachedDevices
  }

  setCachedDevices(devices: DeviceInfo[]): void {
    this.cachedDevices = devices
  }

  async switchDevice(kind: 'video' | 'audio', deviceId: string): Promise<void> {
    const localStream = this.ctx.getLocalStream()
    if (!localStream) return

    const adaptive = getAdaptiveConstraints()
    const constraints: MediaStreamConstraints = kind === 'video'
      ? { video: { deviceId: { exact: deviceId }, ...adaptive.video as MediaTrackConstraints } }
      : { audio: { deviceId: { exact: deviceId }, ...adaptive.audio as MediaTrackConstraints } }

    const newStream = await navigator.mediaDevices.getUserMedia(constraints)
    const newTrack = newStream.getTracks()[0]
    if (!newTrack) return

    this.ctx.setLocalStream((stream) => {
      const oldTracks = kind === 'video' ? stream.getVideoTracks() : stream.getAudioTracks()
      for (const old of oldTracks) {
        stream.removeTrack(old)
        old.stop()
      }
      stream.addTrack(newTrack)
    })

    for (const [, peerState] of this.ctx.getPeerConnections()) {
      const sender = peerState.pc.getSenders().find((s) => s.track?.kind === kind)
      if (sender) {
        await sender.replaceTrack(newTrack)
      }
    }

    this.ctx.emit('local-stream', this.ctx.getLocalStream())
    this.ctx.log.info('Device switched', { kind, deviceId })
  }

  startDeviceChangeMonitoring(): void {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.addEventListener) return

    const handler = async () => {
      const devices = await this.enumerateDevices()
      this.ctx.emit('device-change', devices)
      this.ctx.log.info('Device change detected', { deviceCount: devices.length })
    }

    navigator.mediaDevices.addEventListener('devicechange', handler)
    this.deviceChangeCleanup = () => navigator.mediaDevices.removeEventListener('devicechange', handler)
  }

  stopDeviceChangeMonitoring(): void {
    this.deviceChangeCleanup?.()
    this.deviceChangeCleanup = null
  }
}
