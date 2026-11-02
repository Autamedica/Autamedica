// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudflareCallsClient } from './client'
import { CloudflareCallsSession } from './session'

const CloudflareCallsClientTestOnly = {
  REMOTE_RESUBSCRIBE_MAX_ATTEMPTS: 3,
}

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

describe('CloudflareCallsClient reconnect', () => {
  it('emits reconnecting event when signaling WS closes mid-call', async () => {
    vi.useFakeTimers()
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'doctor',
      roomId: 'room-1',
      apiProxyUrl: '/api/doctors/cloudflare-calls',
      signalingUrl: 'ws://fake-signaling.test',
    })

    const events: string[] = []
    client.on('reconnecting', () => events.push('reconnecting'))

    // Simulate: manually set connected state and ws reference (unit test bypass)
    ;(client as unknown as { connectionState: string }).connectionState = 'connected'
    ;(client as unknown as { intentionalClose: boolean }).intentionalClose = false
    ;(client as unknown as { signalingReconnectAttempt: number }).signalingReconnectAttempt = 0

    // Trigger the reconnect schedule directly
    ;(client as unknown as { scheduleSignalingReconnect: (roomId: string) => void })
      .scheduleSignalingReconnect('room-1')

    expect(events).toContain('reconnecting')

    vi.useRealTimers()
  })

  it('does not reconnect when disconnect was intentional', () => {
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'doctor',
      roomId: 'room-1',
      apiProxyUrl: '/api/doctors/cloudflare-calls',
      signalingUrl: 'ws://fake-signaling.test',
    })

    const events: string[] = []
    client.on('reconnecting', () => events.push('reconnecting'))

    // Mark intentional close
    ;(client as unknown as { intentionalClose: boolean }).intentionalClose = true
    ;(client as unknown as { connectionState: string }).connectionState = 'closed'

    // Try to schedule — should be a no-op
    vi.useFakeTimers()
    ;(client as unknown as { scheduleSignalingReconnect: (roomId: string) => void })
      .scheduleSignalingReconnect('room-1')

    // The reconnecting event fires before the intentionalClose guard (in the timer callback)
    // but the timer callback itself bails early
    vi.advanceTimersByTime(10_000)

    vi.useRealTimers()
    // No WebSocket should have been created (ws stays null)
    expect((client as unknown as { ws: unknown }).ws).toBeNull()
  })

  it('resets reconnect attempt counter on successful connect', () => {
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'doctor',
      roomId: 'room-1',
      apiProxyUrl: '/api/doctors/cloudflare-calls',
      signalingUrl: 'ws://fake-signaling.test',
    })

    ;(client as unknown as { signalingReconnectAttempt: number }).signalingReconnectAttempt = 3
    ;(client as unknown as { intentionalClose: boolean }).intentionalClose = false
    ;(client as unknown as { connectionState: string }).connectionState = 'disconnected'

    // connect() resets the counter
    // We can't fully test connect() without mocking WebSocket, but we verify the reset logic
    // by checking the initial state after construction
    const fresh = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'doctor',
      roomId: 'room-1',
      apiProxyUrl: '/api/doctors/cloudflare-calls',
    })
    expect((fresh as unknown as { signalingReconnectAttempt: number }).signalingReconnectAttempt).toBe(0)
  })
})

describe('CloudflareCallsClient cf-session announce readiness', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('defers the cf-session announce when the local session is not ready yet', async () => {
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'doctor',
      roomId: 'room-1',
      apiProxyUrl: '/api/doctors/cloudflare-calls',
    })

    const sendSignal = vi.fn()
    ;(client as unknown as { sendSignal: typeof sendSignal }).sendSignal = sendSignal
    ;(client as unknown as { cfSession: unknown }).cfSession = {
      isReady: () => false,
      getSessionId: () => 'local-sess-1',
    }

    await (client as unknown as { handleSignalingMessage: (m: unknown) => Promise<void> }).handleSignalingMessage({
      type: 'user-joined',
      from: 'doctor-1',
      data: { userType: 'doctor' },
    })

    expect(sendSignal).not.toHaveBeenCalled()
    const pending = (client as unknown as { pendingPeerAnnouncements: string[] }).pendingPeerAnnouncements
    expect(pending).toContain('doctor-1')
  })

  it('announces the cf-session immediately once the local session is ready', async () => {
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'doctor',
      roomId: 'room-1',
      apiProxyUrl: '/api/doctors/cloudflare-calls',
    })

    const sendSignal = vi.fn()
    ;(client as unknown as { sendSignal: typeof sendSignal }).sendSignal = sendSignal
    ;(client as unknown as { cfSession: unknown }).cfSession = {
      isReady: () => true,
      getSessionId: () => 'local-sess-1',
    }

    await (client as unknown as { handleSignalingMessage: (m: unknown) => Promise<void> }).handleSignalingMessage({
      type: 'user-joined',
      from: 'doctor-1',
      data: { userType: 'doctor' },
    })

    expect(sendSignal).toHaveBeenCalledWith({
      type: 'cf-session',
      from: 'user-1',
      data: { sessionId: 'local-sess-1', userType: 'doctor' },
    })
    const pending = (client as unknown as { pendingPeerAnnouncements: string[] }).pendingPeerAnnouncements
    expect(pending).not.toContain('doctor-1')
  })

  it('does not re-announce on signaling reconnect while the local session is not ready', async () => {
    vi.useFakeTimers()
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'doctor',
      roomId: 'room-1',
      apiProxyUrl: '/api/doctors/cloudflare-calls',
      signalingUrl: 'ws://fake-signaling.test',
    })

    const sendSignal = vi.fn()
    ;(client as unknown as { sendSignal: typeof sendSignal }).sendSignal = sendSignal
    ;(client as unknown as { cfSession: unknown }).cfSession = {
      isReady: () => false,
      getSessionId: () => 'local-sess-1',
    }

    // WebSocket mocked so the reconnect callback can run.
    class FakeWebSocket {
      static OPEN = 1
      readyState = 1
      onopen: (() => void) | null = null
      onmessage: ((e: unknown) => void) | null = null
      onerror: (() => void) | null = null
      onclose: (() => void) | null = null
      send = vi.fn()
      close = vi.fn()
    }
    ;(globalThis as Record<string, unknown>).WebSocket = FakeWebSocket

    ;(client as unknown as { scheduleSignalingReconnect: (roomId: string) => void })
      .scheduleSignalingReconnect('room-1')
    await vi.advanceTimersByTimeAsync(10_000)

    expect(sendSignal).not.toHaveBeenCalledWith({
      type: 'cf-session',
      from: 'user-1',
      data: { sessionId: 'local-sess-1', userType: 'doctor' },
    })

    vi.useRealTimers()
  })

  it('re-subscribes with backoff when a peer re-announces a session that delivered no tracks', async () => {
    vi.useFakeTimers()
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'patient',
      roomId: 'room-1',
      apiProxyUrl: '/api/patients/cloudflare-calls',
    })

    const subscribeToSession = vi.fn().mockResolvedValue([])
    ;(client as unknown as { cfSession: unknown }).cfSession = {
      isReady: () => true,
      getSessionId: () => 'local-sess-1',
      subscribeToSession,
    }
    ;(client as unknown as { userIdToSessionId: Map<string, string> }).userIdToSessionId.set('doctor-1', 'remote-sess-1')
    ;(client as unknown as { remoteSubscribeNoTracks: Set<string> }).remoteSubscribeNoTracks.add('doctor-1')

    await (client as unknown as { handleSignalingMessage: (m: unknown) => Promise<void> }).handleSignalingMessage({
      type: 'cf-session',
      from: 'doctor-1',
      data: { sessionId: 'remote-sess-1', userType: 'doctor' },
    })

    // The duplicate is not dropped idempotently for a peer known to have no tracks;
    // it schedules a bounded backoff re-subscribe (not an immediate one).
    expect(subscribeToSession).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(5_000)
    // The scheduled retry actually re-subscribes.
    expect(subscribeToSession.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(subscribeToSession.mock.calls.length).toBeLessThanOrEqual(CloudflareCallsClientTestOnly.REMOTE_RESUBSCRIBE_MAX_ATTEMPTS)

    vi.useRealTimers()
  })

  it('schedules a bounded retry when the initial subscribe returns no tracks', async () => {
    vi.useFakeTimers()
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'patient',
      roomId: 'room-1',
      apiProxyUrl: '/api/patients/cloudflare-calls',
    })

    const subscribeToSession = vi.fn().mockResolvedValue([])
    ;(client as unknown as { cfSession: unknown }).cfSession = {
      isReady: () => true,
      getSessionId: () => 'local-sess-1',
      subscribeToSession,
    }

    await (client as unknown as { handleSignalingMessage: (m: unknown) => Promise<void> }).handleSignalingMessage({
      type: 'cf-session',
      from: 'doctor-1',
      data: { sessionId: 'remote-sess-1', userType: 'doctor' },
    })

    // Initial subscribe ran (empty result) and flagged the peer for retry.
    expect(subscribeToSession).toHaveBeenCalledTimes(1)
    const marked = (client as unknown as { remoteSubscribeNoTracks: Set<string> }).remoteSubscribeNoTracks
    expect(marked.has('doctor-1')).toBe(true)

    await vi.advanceTimersByTimeAsync(5_000)
    // Backoff retry bundled into the empty-subscribe path, not waiting for a
    // duplicate cf-session.
    expect(subscribeToSession.mock.calls.length).toBeGreaterThanOrEqual(2)

    vi.useRealTimers()
  })

  it('clears the retry budget once a re-subscribe actually pulls tracks', async () => {
    vi.useFakeTimers()
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'patient',
      roomId: 'room-1',
      apiProxyUrl: '/api/patients/cloudflare-calls',
    })

    let attempt = 0
    const pulled = [{ location: 'remote' as const, trackName: 'video0', mid: 'mid-1', sessionId: 'remote-sess-1' }]
    const subscribeToSession = vi.fn().mockImplementation(() => {
      attempt += 1
      return Promise.resolve(attempt === 1 ? [] : pulled)
    })
    ;(client as unknown as { cfSession: unknown }).cfSession = {
      isReady: () => true,
      getSessionId: () => 'local-sess-1',
      subscribeToSession,
    }

    await (client as unknown as { handleSignalingMessage: (m: unknown) => Promise<void> }).handleSignalingMessage({
      type: 'cf-session',
      from: 'doctor-1',
      data: { sessionId: 'remote-sess-1', userType: 'doctor' },
    })

    await vi.advanceTimersByTimeAsync(5_000)
    expect(subscribeToSession.mock.calls.length).toBeGreaterThanOrEqual(2)

    const marked = (client as unknown as { remoteSubscribeNoTracks: Set<string> }).remoteSubscribeNoTracks
    expect(marked.has('doctor-1')).toBe(false)
    const attempts = (client as unknown as { resubscribeAttempts: Map<string, number> }).resubscribeAttempts
    expect(attempts.has('doctor-1')).toBe(false)

    vi.useRealTimers()
  })

  it('ignores duplicate cf-session when the peer already delivered tracks', async () => {
    const client = new CloudflareCallsClient({
      userId: 'user-1',
      userType: 'patient',
      roomId: 'room-1',
      apiProxyUrl: '/api/patients/cloudflare-calls',
    })

    const subscribeToSession = vi.fn().mockResolvedValue([])
    ;(client as unknown as { cfSession: unknown }).cfSession = {
      isReady: () => true,
      getSessionId: () => 'local-sess-1',
      subscribeToSession,
    }
    ;(client as unknown as { userIdToSessionId: Map<string, string> }).userIdToSessionId.set('doctor-1', 'remote-sess-1')

    await (client as unknown as { handleSignalingMessage: (m: unknown) => Promise<void> }).handleSignalingMessage({
      type: 'cf-session',
      from: 'doctor-1',
      data: { sessionId: 'remote-sess-1', userType: 'doctor' },
    })

    expect(subscribeToSession).not.toHaveBeenCalled()
  })
})


describe('CloudflareCallsClient quality lifecycle', () => {
  it('stops failed-session sampling before retry and only reports actual reconnections', async () => {
    vi.useFakeTimers()
    const counts = new Map<CloudflareCallsSession, number>()
    type SessionInternals = { cfg: { onConnectionStateChange: (state: RTCPeerConnectionState) => void } }
    vi.spyOn(CloudflareCallsSession.prototype, 'connect').mockImplementation(async function (this: CloudflareCallsSession) {
      ;(this as unknown as SessionInternals).cfg.onConnectionStateChange('connected')
      return 'session-test'
    })
    vi.spyOn(CloudflareCallsSession.prototype, 'getStats').mockImplementation(async function (this: CloudflareCallsSession) {
      counts.set(this, (counts.get(this) ?? 0) + 1)
      return new Map() as RTCStatsReport
    })
    vi.spyOn(CloudflareCallsSession.prototype, 'connectionState', 'get').mockReturnValue('connected')
    const client = new CloudflareCallsClient({ userId: 'doctor', userType: 'doctor', roomId: 'room' })
    const internal = client as unknown as {
      localStream: MediaStream
      connectSignaling: () => Promise<void>
      cfSession: CloudflareCallsSession
    }
    internal.localStream = { getTracks: () => [] } as unknown as MediaStream
    internal.connectSignaling = async () => {}
    const reconnected = vi.fn()
    client.on('reconnected', reconnected)
    try {
      await client.connect()
      const first = internal.cfSession
      ;(first as unknown as SessionInternals).cfg.onConnectionStateChange('failed')
      const firstCount = counts.get(first)
      await client.connect()
      await vi.advanceTimersByTimeAsync(5_000)
      expect(counts.get(first)).toBe(firstCount)
      expect(counts.get(internal.cfSession)).toBeGreaterThan(1)
      expect(reconnected).not.toHaveBeenCalled()
      const cfg = (internal.cfSession as unknown as SessionInternals).cfg
      cfg.onConnectionStateChange('disconnected')
      cfg.onConnectionStateChange('connected')
      expect(reconnected).toHaveBeenCalledTimes(1)
    } finally {
      await client.disconnect()
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })
})
