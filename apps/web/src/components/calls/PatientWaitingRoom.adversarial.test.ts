// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import PatientWaitingRoom from './PatientWaitingRoom'

// Mock gsap to avoid DOM animation issues in test environment
vi.mock('gsap', () => ({
  gsap: {
    fromTo: vi.fn(),
  },
}))

describe('Adversarial QA: PatientWaitingRoom', () => {
  let container: HTMLDivElement
  let stopTrackSpy: ReturnType<typeof vi.fn>
  let mockTrack: any
  let closeAudioCtxSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)

    stopTrackSpy = vi.fn()
    mockTrack = {
      stop: stopTrackSpy,
      enabled: true,
      kind: 'video',
    }

    class FakeMediaStream {
      getTracks() { return [mockTrack] }
      getVideoTracks() { return [mockTrack] }
      getAudioTracks() { return [{ stop: stopTrackSpy, enabled: true, kind: 'audio' }] }
    }
    // @ts-ignore
    window.MediaStream = FakeMediaStream

    closeAudioCtxSpy = vi.fn().mockResolvedValue(undefined)
    class MockAudioContext {
      state = 'running'
      createMediaStreamSource() {
        return { connect: vi.fn() }
      }
      createAnalyser() {
        return {
          fftSize: 256,
          frequencyBinCount: 128,
          getByteFrequencyData: vi.fn(),
        }
      }
      close() {
        return (closeAudioCtxSpy as () => void)()
      }
    }
    // @ts-ignore
    window.AudioContext = MockAudioContext
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('Edge Case 1: NotAllowedError completely hides the Join Consultation CTA and locks patient out', async () => {
    const notAllowedError = new DOMException('Permission denied by user', 'NotAllowedError')
    // @ts-ignore
    navigator.mediaDevices = {
      getUserMedia: vi.fn().mockRejectedValue(notAllowedError),
    }

    const onJoinSpy = vi.fn()
    const root = createRoot(container)

    await act(async () => {
      root.render(
        React.createElement(PatientWaitingRoom, {
          doctorName: 'Dr. Felipe Silva',
          onJoin: onJoinSpy,
          language: 'pt',
        })
      )
    })

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    // UI displays the error message
    expect(container.textContent).toContain('Acesso à câmera ou microfone não permitido')

    // Check for "Tentar novamente" and fallback "Entrar sem câmera" buttons
    expect(container.textContent).toContain('Tentar novamente')
    expect(container.textContent).toContain('Entrar sem câmera')

    // Verify patient can enter without camera
    const joinWithoutMediaBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Entrar sem câmera')
    )
    expect(joinWithoutMediaBtn).toBeDefined()
    await act(async () => {
      joinWithoutMediaBtn?.click()
    })
    expect(onJoinSpy).toHaveBeenCalledWith({
      stream: null,
      videoEnabled: false,
      audioEnabled: false,
    })

    act(() => root.unmount())
  })

  it('Edge Case 2: Clean unmount stops tracks, cancels animationFrame, and closes AudioContext', async () => {
    const cancelAnimFrameSpy = vi.spyOn(window, 'cancelAnimationFrame')
    const fakeStream = new (window as any).MediaStream()

    // @ts-ignore
    navigator.mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(fakeStream),
    }

    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', {
      set: vi.fn(),
      configurable: true,
    })

    const root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(PatientWaitingRoom, {
          doctorName: 'Dr. Felipe Silva',
          onJoin: vi.fn(),
        })
      )
    })

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    // Unmount component
    await act(async () => {
      root.unmount()
    })

    // Verify cleanup
    expect(stopTrackSpy).toHaveBeenCalled()
    expect(closeAudioCtxSpy).toHaveBeenCalled()
    expect(cancelAnimFrameSpy).toHaveBeenCalled()
  })

  it('Edge Case 3: Race condition when unmounting while getUserMedia is pending cleans up active stream', async () => {
    let resolveMediaPromise: (stream: any) => void = () => {}
    const pendingMediaPromise = new Promise((resolve) => {
      resolveMediaPromise = resolve
    })

    const orphanedStopSpy = vi.fn()
    const orphanedStream = {
      getTracks: vi.fn(() => [{ stop: orphanedStopSpy }]),
      getVideoTracks: vi.fn(() => [{ stop: orphanedStopSpy }]),
      getAudioTracks: vi.fn(() => [{ stop: orphanedStopSpy }]),
    }

    // @ts-ignore
    navigator.mediaDevices = {
      getUserMedia: vi.fn().mockReturnValue(pendingMediaPromise),
    }

    const root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(PatientWaitingRoom, {
          doctorName: 'Dr. Felipe Silva',
          onJoin: vi.fn(),
        })
      )
    })

    // Unmount while getUserMedia is STILL in-flight!
    await act(async () => {
      root.unmount()
    })

    // Browser completes permission dialog and fulfills getUserMedia
    await act(async () => {
      resolveMediaPromise(orphanedStream)
      await new Promise(r => setTimeout(r, 50))
    })

    // EMPIRICAL EVIDENCE OF REMEDIATION:
    // With isMountedRef guard, when getUserMedia resolves after unmount,
    // the stream's tracks ARE immediately stopped! No camera leak.
    expect(orphanedStopSpy).toHaveBeenCalled()
  })
})
