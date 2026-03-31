import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PeerConnectionFactory } from './peer-connection-factory'
import type { PeerConnectionFactoryCallbacks, PeerState } from './peer-connection-factory'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('./debug', () => ({
  createTelemedicineLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('./media-manager', () => ({}))
vi.mock('./quality-monitor', () => ({}))

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
}

function createMockMedia() {
  return { attachLocalTracks: vi.fn() } as any
}

function createMockQualityMonitor() {
  return { collectNow: vi.fn(), deletePeer: vi.fn() } as any
}

function createMockCallbacks(): PeerConnectionFactoryCallbacks {
  return {
    emit: vi.fn(),
    sendSignalingMessage: vi.fn(),
    emitChatReady: vi.fn(),
  }
}

// Minimal RTCPeerConnection mock — must be a real class so `new` works
const pcInstances_: any[] = []

class MockRTCPeerConnection {
  connectionState = 'new'
  iceConnectionState = 'new'
  signalingState = 'stable'
  localDescription: any = null
  ontrack: any = null
  onicecandidate: any = null
  onconnectionstatechange: any = null
  oniceconnectionstatechange: any = null
  onsignalingstatechange: any = null
  ondatachannel: any = null
  onnegotiationneeded: any = null
  restartIce = vi.fn()
  setLocalDescription = vi.fn(async () => {})
  close = vi.fn()
  createDataChannel = vi.fn(() => ({
    label: 'autamedica-chat',
    readyState: 'connecting',
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
  }))

  constructor(_config?: any) {
    pcInstances_.push(this)
  }
}

function mockRTCPeerConnection() {
  pcInstances_.length = 0
  vi.stubGlobal('RTCPeerConnection', MockRTCPeerConnection)
  return { instances: pcInstances_ }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('PeerConnectionFactory — ICE restart logic', () => {
  let factory: PeerConnectionFactory
  let callbacks: PeerConnectionFactoryCallbacks
  let peerConnections: Map<string, PeerState>
  let pcInstances: any[]

  beforeEach(() => {
    vi.useFakeTimers()
    const { instances } = mockRTCPeerConnection()
    pcInstances = instances

    callbacks = createMockCallbacks()
    factory = new PeerConnectionFactory(
      createMockLogger(),
      'session-1',
      createMockMedia(),
      createMockQualityMonitor(),
      callbacks,
    )
    peerConnections = new Map()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.example.com' }]

  function createPeer() {
    return factory.ensurePeerConnection('remote-1', ICE_SERVERS, 'local-1', 'doctor', peerConnections)
  }

  it('should use MAX_ICE_RESTART_ATTEMPTS = 5', () => {
    const peer = createPeer()
    const pc = pcInstances[0]

    // Trigger 5 ICE failures — all should schedule restarts
    for (let i = 0; i < 5; i++) {
      pc.iceConnectionState = 'failed'
      pc.oniceconnectionstatechange()
    }

    expect(peer.iceRestartCount).toBe(5)

    // 6th failure should NOT increment (limit reached)
    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()
    expect(peer.iceRestartCount).toBe(5)
  })

  it('should use ICE_RESTART_BACKOFF_BASE_MS = 2000', () => {
    const peer = createPeer()
    const pc = pcInstances[0]

    // Seed Math.random to 0 so jitter = 0
    vi.spyOn(Math, 'random').mockReturnValue(0)

    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()

    // First attempt: 2000 * 2^0 + 0 = 2000ms
    expect(peer.iceRestartCount).toBe(1)

    // restartIce should NOT have been called yet
    expect(pc.restartIce).not.toHaveBeenCalled()

    // Advance exactly 2000ms
    vi.advanceTimersByTime(2000)
    expect(pc.restartIce).toHaveBeenCalledOnce()
  })

  it('should include jitter in backoff delay (not exactly base * 2^attempt)', () => {
    createPeer()
    const pc = pcInstances[0]

    // Make random return 0.5 → jitter = 500ms
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()

    // Expected delay: 2000 * 2^0 + 0.5 * 1000 = 2500ms
    // At 2000ms it should NOT have restarted yet
    vi.advanceTimersByTime(2000)
    expect(pc.restartIce).not.toHaveBeenCalled()

    // At 2500ms it should
    vi.advanceTimersByTime(500)
    expect(pc.restartIce).toHaveBeenCalledOnce()
  })

  it('should apply exponential backoff across attempts', () => {
    const peer = createPeer()
    const pc = pcInstances[0]
    vi.spyOn(Math, 'random').mockReturnValue(0)

    // attempt 0 → 2000ms, attempt 1 → 4000ms, attempt 2 → 8000ms
    for (let i = 0; i < 3; i++) {
      pc.iceConnectionState = 'failed'
      pc.oniceconnectionstatechange()
    }

    expect(peer.iceRestartCount).toBe(3)

    // Advance past all timers and check total restartIce calls
    vi.advanceTimersByTime(8000)
    expect(pc.restartIce).toHaveBeenCalledTimes(3)
  })

  it('should reset iceRestartCount on successful connection', () => {
    const peer = createPeer()
    const pc = pcInstances[0]

    // Trigger 3 failures
    for (let i = 0; i < 3; i++) {
      pc.iceConnectionState = 'failed'
      pc.oniceconnectionstatechange()
    }
    expect(peer.iceRestartCount).toBe(3)

    // Connection succeeds
    pc.iceConnectionState = 'connected'
    pc.oniceconnectionstatechange()
    expect(peer.iceRestartCount).toBe(0)
  })

  it('should stop retrying after MAX_ICE_RESTART_ATTEMPTS (5)', () => {
    createPeer()
    const pc = pcInstances[0]
    vi.spyOn(Math, 'random').mockReturnValue(0)

    // Exhaust all 5 attempts
    for (let i = 0; i < 5; i++) {
      pc.iceConnectionState = 'failed'
      pc.oniceconnectionstatechange()
    }

    // Flush all scheduled timers
    vi.runAllTimers()
    expect(pc.restartIce).toHaveBeenCalledTimes(5)

    // 6th attempt — should NOT schedule another restart
    pc.restartIce.mockClear()
    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()

    vi.runAllTimers()
    expect(pc.restartIce).not.toHaveBeenCalled()
  })

  it('should not call restartIce if peer was removed during backoff', () => {
    createPeer()
    const pc = pcInstances[0]
    vi.spyOn(Math, 'random').mockReturnValue(0)

    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()

    // Remove peer before timer fires
    peerConnections.delete('remote-1')

    vi.advanceTimersByTime(2000)
    expect(pc.restartIce).not.toHaveBeenCalled()
  })

  it('should not call restartIce if ICE state recovered during backoff', () => {
    createPeer()
    const pc = pcInstances[0]
    vi.spyOn(Math, 'random').mockReturnValue(0)

    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()

    // ICE recovers before timer fires
    pc.iceConnectionState = 'connected'

    vi.advanceTimersByTime(2000)
    expect(pc.restartIce).not.toHaveBeenCalled()
  })

  it('should emit ice-state-change event on state changes', () => {
    createPeer()
    const pc = pcInstances[0]

    pc.iceConnectionState = 'checking'
    pc.oniceconnectionstatechange()

    expect(callbacks.emit).toHaveBeenCalledWith('ice-state-change', {
      peerId: 'remote-1',
      state: 'checking',
    })
  })
})

describe('PeerConnectionFactory — reconnection events', () => {
  let factory: PeerConnectionFactory
  let callbacks: PeerConnectionFactoryCallbacks
  let peerConnections: Map<string, PeerState>
  let pcInstances: any[]

  beforeEach(() => {
    vi.useFakeTimers()
    const { instances } = mockRTCPeerConnection()
    pcInstances = instances

    callbacks = createMockCallbacks()
    factory = new PeerConnectionFactory(
      createMockLogger(),
      'session-1',
      createMockMedia(),
      createMockQualityMonitor(),
      callbacks,
    )
    peerConnections = new Map()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.example.com' }]

  function createPeer() {
    return factory.ensurePeerConnection('remote-1', ICE_SERVERS, 'local-1', 'doctor', peerConnections)
  }

  it('should emit reconnecting event when ICE restart is scheduled', () => {
    createPeer()
    const pc = pcInstances[0]

    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()

    expect(callbacks.emit).toHaveBeenCalledWith('reconnecting', {
      peerId: 'remote-1',
      attempt: 1,
      maxAttempts: 5,
    })
  })

  it('should emit reconnected event when ICE recovers after restart', () => {
    createPeer()
    const pc = pcInstances[0]

    // Trigger ICE failure first (sets iceRestartCount to 1)
    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()

    // ICE recovers
    pc.iceConnectionState = 'connected'
    pc.oniceconnectionstatechange()

    expect(callbacks.emit).toHaveBeenCalledWith('reconnected', {
      peerId: 'remote-1',
      afterAttempts: 1,
    })
  })

  it('should NOT emit reconnected if no ICE restart was needed (normal first connect)', () => {
    createPeer()
    const pc = pcInstances[0]

    // Direct connection without any prior failure
    pc.iceConnectionState = 'connected'
    pc.oniceconnectionstatechange()

    expect(callbacks.emit).not.toHaveBeenCalledWith('reconnected', expect.anything())
  })

  it('should emit correct attempt count across multiple reconnection cycles', () => {
    createPeer()
    const pc = pcInstances[0]

    // Trigger 3 ICE failures
    for (let i = 0; i < 3; i++) {
      pc.iceConnectionState = 'failed'
      pc.oniceconnectionstatechange()
    }

    // Recover — afterAttempts should be 3
    pc.iceConnectionState = 'connected'
    pc.oniceconnectionstatechange()

    expect(callbacks.emit).toHaveBeenCalledWith('reconnected', {
      peerId: 'remote-1',
      afterAttempts: 3,
    })

    // Clear mock to isolate next assertions
    ;(callbacks.emit as ReturnType<typeof vi.fn>).mockClear()

    // Fail again — counter was reset, so attempt should be 1
    pc.iceConnectionState = 'failed'
    pc.oniceconnectionstatechange()

    expect(callbacks.emit).toHaveBeenCalledWith('reconnecting', {
      peerId: 'remote-1',
      attempt: 1,
      maxAttempts: 5,
    })
  })
})
