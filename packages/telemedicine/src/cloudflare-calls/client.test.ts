// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudflareCallsClient } from './client'

describe('CloudflareCallsClient.warmUp', () => {
  beforeEach(() => {
    vi.restoreAllMocks()

    const videoTrack = { contentHint: '', kind: 'video' } as MediaStreamTrack
    const audioTrack = { contentHint: '', kind: 'audio' } as MediaStreamTrack
    const stream = {
      getTracks: () => [videoTrack, audioTrack],
      getVideoTracks: () => [videoTrack],
      getAudioTracks: () => [audioTrack],
    } as unknown as MediaStream

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    })
  })

  it('honors provided warmUp constraints before falling back to adaptive defaults', async () => {
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'doctor',
      roomId: 'room-1',
      apiProxyUrl: '/api/doctors/cloudflare-calls',
    })

    const constraints: MediaStreamConstraints = {
      video: { deviceId: { exact: 'camera-1' } },
      audio: { deviceId: { exact: 'mic-1' } },
    }

    await client.warmUp(constraints)

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(constraints)
  })
})
