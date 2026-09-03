// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { PixPaymentModal } from './PixPaymentModal'

const mockRemoveChannel = vi.fn()
const mockChannel = vi.fn(() => ({
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}))

vi.mock('@autamedica/auth', () => ({
  createBrowserClient: vi.fn(() => ({
    channel: mockChannel,
    removeChannel: mockRemoveChannel,
  })),
}))

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,mockqr'),
  },
}))

describe('Adversarial QA: PixPaymentModal', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    vi.clearAllMocks()
    container = document.createElement('div')
    document.body.appendChild(container)
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      configurable: true,
    })
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('Edge Case 1: API returns 500 HTML (e.g. Cloudflare / gateway error)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("<!DOCTYPE html><html>500 Internal Error</html>"),
    })

    const root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(PixPaymentModal, {
          isOpen: true,
          onClose: vi.fn(),
          appointmentId: 'appt-123',
        })
      )
    })

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    // The component safely catches non-JSON HTML error and displays friendly error title
    expect(container.textContent).toContain('Erro ao gerar cobrança Pix')
    act(() => root.unmount())
  })

  it('Edge Case 2: Modal unmounted before payment completes cleans up interval and realtime', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/payments/pix/create')) {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(JSON.stringify({
            data: {
              paymentId: 'pix-999',
              status: 'pending',
              qrCode: '00020126...mockpix',
              amountCents: 15000,
              currency: 'BRL',
            }
          }))
        })
      }
      return Promise.resolve({
        ok: true,
        text: () => Promise.resolve(JSON.stringify({ status: 'pending' })),
        json: () => Promise.resolve({ status: 'pending' })
      })
    })

    const root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(PixPaymentModal, {
          isOpen: true,
          onClose: vi.fn(),
          appointmentId: 'appt-123',
        })
      )
    })

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(mockChannel).toHaveBeenCalledWith('pix_appointment_pix-999')

    // Close modal
    await act(async () => {
      root.render(
        React.createElement(PixPaymentModal, {
          isOpen: false,
          onClose: vi.fn(),
          appointmentId: 'appt-123',
        })
      )
    })

    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(mockRemoveChannel).toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('Edge Case 3: Rapid clicks on Copy Button debounces and avoids timer collisions', async () => {
    vi.useFakeTimers()
    const writeTextSpy = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextSpy },
      configurable: true,
    })

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(JSON.stringify({
        data: {
          paymentId: 'pix-111',
          status: 'pending',
          qrCode: 'pix-code-123',
          amountCents: 15000,
        }
      }))
    })

    const root = createRoot(container)
    await act(async () => {
      root.render(
        React.createElement(PixPaymentModal, {
          isOpen: true,
          onClose: vi.fn(),
          appointmentId: 'appt-123',
        })
      )
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50)
    })

    const copyBtn = container.querySelector('button.shrink-0') as HTMLButtonElement
    expect(copyBtn).not.toBeNull()

    // First click
    await act(async () => {
      copyBtn.click()
    })
    expect(copyBtn.textContent).toContain('Copiado!')

    // Advance 2000ms
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(copyBtn.textContent).toContain('Copiado!')

    // Second click at T=2000ms resets the timer to 2500ms
    await act(async () => {
      copyBtn.click()
    })
    expect(copyBtn.textContent).toContain('Copiado!')

    // Advance 600ms (to T=2600ms): with debounce, the timer was reset, so button STILL shows 'Copiado!'
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    expect(copyBtn.textContent).toContain('Copiado!')

    // Advance 2000ms more (to T=4600ms): debounced timer fires and restores to Copiar
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(copyBtn.textContent).toContain('Copiar')

    act(() => root.unmount())
    vi.useRealTimers()
  })
})
