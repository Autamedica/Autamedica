import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SignalingClient } from './client'

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@autamedica/shared', () => ({
  ensureClientEnv: vi.fn().mockReturnValue('wss://signal.test'),
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// Track all WebSocket instances created
let wsInstances: MockWebSocket[] = []

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  url: string
  readyState: number = MockWebSocket.CONNECTING
  onopen: ((event: any) => void) | null = null
  onclose: ((event: any) => void) | null = null
  onerror: ((event: any) => void) | null = null
  onmessage: ((event: any) => void) | null = null

  sent: string[] = []

  constructor(url: string) {
    this.url = url
    wsInstances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close(_code?: number, _reason?: string) {
    this.readyState = MockWebSocket.CLOSED
    // Don't auto-trigger onclose — tests control that
  }

  // Test helpers
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN
    this.onopen?.({})
  }

  simulateClose(code: number, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.({ code, reason })
  }

  simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }

  simulateError(error: any) {
    this.onerror?.(error)
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('SignalingClient — reconnection logic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    wsInstances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function createClient(roomId?: string) {
    return new SignalingClient('user-1', 'doctor', roomId)
  }

  it('should have maxReconnectAttempts = 5', async () => {
    const client = createClient('room-1')
    const connectPromise = client.connect()
    wsInstances[0].simulateOpen()
    await connectPromise

    // Trigger 5 abnormal closes + reconnect attempts
    for (let i = 0; i < 5; i++) {
      const ws = wsInstances[wsInstances.length - 1]
      ws.simulateClose(1006, 'abnormal')
      vi.runOnlyPendingTimers()
      // New WS instance created for each reconnect
    }

    // 6th close should NOT create a new instance
    const countBefore = wsInstances.length
    const ws = wsInstances[wsInstances.length - 1]
    ws.simulateClose(1006, 'abnormal')
    vi.runOnlyPendingTimers()

    expect(wsInstances.length).toBe(countBefore)
  })

  it('should include jitter in reconnect backoff (not exactly 1000 * attempt)', () => {
    const client = createClient('room-1')
    const connectPromise = client.connect()
    wsInstances[0].simulateOpen()
    connectPromise.catch(() => {}) // suppress unhandled

    // With random = 0.5, delay = 1000 * 1 + 0.5 * 500 = 1250ms
    vi.spyOn(Math, 'random').mockReturnValue(0.5)

    wsInstances[0].simulateClose(1006)

    // At 1000ms the reconnect should NOT have fired
    vi.advanceTimersByTime(1000)
    expect(wsInstances.length).toBe(1) // still only the original

    // At 1250ms it should
    vi.advanceTimersByTime(250)
    expect(wsInstances.length).toBe(2) // reconnect created new WS
  })

  it('should NOT reconnect on normal close (code 1000)', async () => {
    const client = createClient('room-1')
    const connectPromise = client.connect()
    wsInstances[0].simulateOpen()
    await connectPromise

    wsInstances[0].simulateClose(1000, 'Client disconnect')

    vi.runAllTimers()
    // Only the original instance, no reconnect
    expect(wsInstances.length).toBe(1)
  })

  it('should queue messages when WebSocket is not open', () => {
    const client = createClient('room-1')
    client.connect().catch(() => {}) // ws not open yet

    const msg = { type: 'offer', data: 'sdp' }
    client.send(msg as any)

    // Nothing sent on ws — it's still CONNECTING
    expect(wsInstances[0].sent.length).toBe(0)
  })

  it('should drain queued messages on successful connection', async () => {
    const client = createClient('room-1')
    const connectPromise = client.connect()

    // Queue messages before open
    const msg1 = { type: 'offer', data: 'sdp1' }
    const msg2 = { type: 'answer', data: 'sdp2' }
    client.send(msg1 as any)
    client.send(msg2 as any)

    expect(wsInstances[0].sent.length).toBe(0)

    // Open triggers drain
    wsInstances[0].simulateOpen()
    await connectPromise

    expect(wsInstances[0].sent.length).toBe(2)
    expect(JSON.parse(wsInstances[0].sent[0])).toEqual(msg1)
    expect(JSON.parse(wsInstances[0].sent[1])).toEqual(msg2)
  })

  it('should reset reconnectAttempts on successful connection', async () => {
    const client = createClient('room-1')
    const connectPromise = client.connect()
    wsInstances[0].simulateOpen()
    await connectPromise

    // Abnormal close triggers reconnect
    wsInstances[0].simulateClose(1006)
    vi.runOnlyPendingTimers()

    // Reconnected WS opens
    wsInstances[1].simulateOpen()

    // Another abnormal close — should reconnect again (attempts reset)
    wsInstances[1].simulateClose(1006)
    vi.runOnlyPendingTimers()

    expect(wsInstances.length).toBe(3) // original + 2 reconnects
  })

  it('should send messages directly when WebSocket is open', async () => {
    const client = createClient('room-1')
    const connectPromise = client.connect()
    wsInstances[0].simulateOpen()
    await connectPromise

    const msg = { type: 'ice-candidate', data: 'candidate' }
    client.send(msg as any)

    expect(wsInstances[0].sent.length).toBe(1)
    expect(JSON.parse(wsInstances[0].sent[0])).toEqual(msg)
  })

  it('should dispatch received messages to typed listeners', async () => {
    const client = createClient('room-1')
    const connectPromise = client.connect()
    wsInstances[0].simulateOpen()
    await connectPromise

    const handler = vi.fn()
    client.on('offer', handler)

    wsInstances[0].simulateMessage({ type: 'offer', sdp: 'test' })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ type: 'offer', sdp: 'test' })
  })

  it('should report isConnected correctly', async () => {
    const client = createClient()
    expect(client.isConnected).toBe(false)

    const connectPromise = client.connect()
    expect(client.isConnected).toBe(false) // still CONNECTING

    wsInstances[0].simulateOpen()
    await connectPromise
    expect(client.isConnected).toBe(true)

    client.disconnect()
    expect(client.isConnected).toBe(false)
  })
})
