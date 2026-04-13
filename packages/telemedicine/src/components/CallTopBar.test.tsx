// @vitest-environment happy-dom
import { afterEach, describe, it, expect } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { CallTopBar } from './CallTopBar'

afterEach(() => {
  cleanup()
})

describe('CallTopBar', () => {
  const baseProps = {
    phase: 'peer-ready' as const,
    qualityLevel: 'good' as const,
    formattedDuration: '02:15',
    participantCount: 2,
    isRecording: false,
    showControls: true,
  }

  it('renders SFU badge when runtime is cloudflare-calls', () => {
    render(<CallTopBar {...baseProps} runtime="cloudflare-calls" />)
    expect(screen.getByText('SFU')).toBeDefined()
    expect(screen.getByTitle('Cloudflare Calls SFU')).toBeDefined()
  })

  it('renders P2P badge when runtime is webrtc-p2p', () => {
    render(<CallTopBar {...baseProps} runtime="webrtc-p2p" />)
    expect(screen.getByText('P2P')).toBeDefined()
    expect(screen.getByTitle('WebRTC Peer-to-Peer')).toBeDefined()
  })

  it('does not render runtime badge when runtime is undefined', () => {
    render(<CallTopBar {...baseProps} />)
    expect(screen.queryByText('SFU')).toBeNull()
    expect(screen.queryByText('P2P')).toBeNull()
  })

  it('shows "En consulta" when phase is peer-ready', () => {
    render(<CallTopBar {...baseProps} />)
    expect(screen.getByText('En consulta')).toBeDefined()
  })

  it('shows "Conectando..." when phase is joining', () => {
    render(<CallTopBar {...baseProps} phase="joining" />)
    expect(screen.getByText('Conectando...')).toBeDefined()
  })

  it('does not render when showControls is false', () => {
    const { container } = render(<CallTopBar {...baseProps} showControls={false} />)
    expect(container.innerHTML).toBe('')
  })
})
