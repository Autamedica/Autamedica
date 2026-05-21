// @vitest-environment happy-dom
import { act, renderHook } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useCallLifecycleEffects } from './useCallLifecycleEffects'
import type { CallProvider, ConnectionState } from '../providers/types'

function makeProvider(): CallProvider {
  return {
    warmUp: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    getLocalStream: vi.fn(() => null),
    toggleAudio: vi.fn(() => true),
    toggleVideo: vi.fn(() => true),
    switchDevice: vi.fn(),
    sendChatMessage: vi.fn(() => true),
    on: vi.fn(() => vi.fn()),
  }
}

function renderLifecycle(connectionState: ConnectionState) {
  const provider = makeProvider()
  const persistCallStatus = vi.fn().mockResolvedValue(undefined)
  const hasStartedCallRef = { current: true }
  const manualHangupRef = { current: false }
  const onCallStartRef = { current: undefined }

  const hook = renderHook(
    ({ state }) => useCallLifecycleEffects({
      isInRoom: false,
      isCallEstablished: false,
      client: provider,
      callId: 'call-1',
      connectionState: state,
      persistCallStatus,
      hasStartedCallRef,
      manualHangupRef,
      onCallStartRef,
      remoteUsers: new Map(),
      remoteVideosRef: { current: new Map() },
      localVideoRef: createRef<HTMLVideoElement>(),
      localStream: null,
      screenShareRef: createRef<HTMLVideoElement>(),
      screenStream: null,
      chatMessagesRef: createRef<HTMLDivElement>(),
      chatMessages: [],
      isChatPanelOpen: false,
    }),
    { initialProps: { state: connectionState } },
  )

  return { ...hook, provider, persistCallStatus }
}

describe('useCallLifecycleEffects reconnect persistence', () => {
  it('does not end the call after transport failure or close', () => {
    const { persistCallStatus, rerender } = renderLifecycle('failed')

    expect(persistCallStatus).not.toHaveBeenCalledWith('ended', 'connection_closed')

    rerender({ state: 'closed' })

    expect(persistCallStatus).not.toHaveBeenCalledWith('ended', 'connection_closed')
  })

  it('disconnects on page unload without persisting an ended call', () => {
    const { provider, persistCallStatus } = renderLifecycle('connected')

    act(() => {
      window.dispatchEvent(new Event('beforeunload'))
    })

    expect(provider.disconnect).toHaveBeenCalledTimes(1)
    expect(persistCallStatus).not.toHaveBeenCalledWith('ended', 'page_closed')
  })
})
