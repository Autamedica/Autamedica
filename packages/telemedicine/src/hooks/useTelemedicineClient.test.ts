import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTelemedicineClient } from './useTelemedicineClient'

// Declare mockClient — initialized before vi.mock so the factory can close over it
const mockClient = {
  on: vi.fn(),
  off: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn().mockResolvedValue(undefined),
  startLocalStream: vi.fn(),
  stopLocalStream: vi.fn(),
  getConnectionState: vi.fn(() => 'disconnected'),
  getPeerConnections: vi.fn(() => new Map()),
  getLocalStream: vi.fn(() => null),
  isAudioEnabled: vi.fn(() => false),
  isVideoEnabled: vi.fn(() => false),
  toggleAudio: vi.fn(() => true),
  toggleVideo: vi.fn(() => true)
}

// Mock WebRTCClient — always returns the same mockClient instance
vi.mock('../webrtc-client', () => ({
  WebRTCClient: vi.fn().mockImplementation(function () { return mockClient })
}))

// Mock MediaStream
Object.defineProperty(global, 'MediaStream', {
  writable: true,
  value: vi.fn().mockImplementation(function () {
    return {
      getTracks: vi.fn(() => []),
      getVideoTracks: vi.fn(() => []),
      getAudioTracks: vi.fn(() => [])
    }
  })
})

describe('useTelemedicineClient', () => {
  beforeEach(() => {
    // Reset call counts, but keep mockResolvedValue on connect/disconnect
    Object.values(mockClient).forEach((fn) => {
      if (typeof (fn as ReturnType<typeof vi.fn>).mockClear === 'function') {
        (fn as ReturnType<typeof vi.fn>).mockClear()
      }
    })
    // Re-apply resolved value after clear
    mockClient.connect.mockResolvedValue(undefined)
    mockClient.disconnect.mockResolvedValue(undefined)
  })

  afterEach(() => {
    // nothing
  })

  it('should initialize with default state', () => {
    const { result } = renderHook(() =>
      useTelemedicineClient('test-room', 'test-user', 'patient')
    )

    expect(result.current.client).toBeTruthy()
    expect(result.current.connectionState).toBe('disconnected')
    expect(result.current.localStream).toBeNull()
    expect(result.current.remoteStreams).toEqual(new Map())
    expect(result.current.error).toBeNull()
    expect(result.current.isConnecting).toBe(false)
    expect(result.current.reconnectAttempts).toBe(0)
  })

  it('should provide connect function', () => {
    const { result } = renderHook(() =>
      useTelemedicineClient('test-room', 'test-user', 'patient')
    )

    expect(typeof result.current.connect).toBe('function')
    expect(typeof result.current.disconnect).toBe('function')
    expect(typeof result.current.startLocalStream).toBe('function')
    expect(typeof result.current.stopLocalStream).toBe('function')
  })

  it('should call connect on client when connect is called', async () => {
    const { result } = renderHook(() =>
      useTelemedicineClient('test-room', 'test-user', 'patient')
    )

    const mockConnect = result.current.client?.connect as any
    mockConnect.mockResolvedValueOnce(undefined)

    await act(async () => {
      await result.current.connect()
    })

    expect(mockConnect).toHaveBeenCalledWith('test-room')
  })

  it('should handle connection errors', async () => {
    const { result } = renderHook(() =>
      useTelemedicineClient('test-room', 'test-user', 'patient')
    )

    const mockConnect = result.current.client?.connect as any
    const error = new Error('Connection failed')
    mockConnect.mockRejectedValueOnce(error)

    await act(async () => {
      try {
        await result.current.connect()
      } catch (e) {
        // Expected to throw
      }
    })

    await waitFor(() => {
      expect(result.current.error).toEqual(error)
    })
  })

  it('should call startLocalStream with constraints', async () => {
    const { result } = renderHook(() =>
      useTelemedicineClient('test-room', 'test-user', 'patient')
    )

    const mockStartLocalStream = result.current.client?.startLocalStream as any
    const mockStream = new MediaStream()
    mockStartLocalStream.mockResolvedValueOnce(mockStream)

    const constraints = { video: true, audio: false }

    await act(async () => {
      await result.current.startLocalStream(constraints)
    })

    expect(mockStartLocalStream).toHaveBeenCalledWith(constraints)
  })

  it('should cleanup on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useTelemedicineClient('test-room', 'test-user', 'patient')
    )

    const mockDisconnect = result.current.client?.disconnect as any

    unmount()

    expect(mockDisconnect).toHaveBeenCalled()
  })

  it('should handle auto-connect option', () => {
    const { result } = renderHook(() =>
      useTelemedicineClient('test-room', 'test-user', 'patient', { autoConnect: true })
    )

    const mockConnect = result.current.client?.connect as any
    expect(mockConnect).toHaveBeenCalledWith('test-room')
  })
})