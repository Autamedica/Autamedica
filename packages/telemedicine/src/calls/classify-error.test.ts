import { describe, it, expect } from 'vitest'
import { classifyCallError } from './classify-error'

describe('classifyCallError', () => {
  it('classifies signaling timeout', () => {
    expect(classifyCallError(new Error('Signaling timeout'))).toBe('signaling_timeout')
  })

  it('classifies signaling reconnect exhausted', () => {
    expect(classifyCallError(new Error('Signaling reconnect exhausted'))).toBe('signaling_reconnect_exhausted')
  })

  it('classifies SFU connection failure', () => {
    expect(classifyCallError(new Error('Cloudflare Calls SFU connection failed'))).toBe('sfu_connection_failed')
  })

  it('classifies camera permission denied', () => {
    expect(classifyCallError(new Error('NotAllowedError: Permission denied for video'))).toBe('camera_permission_denied')
  })

  it('classifies microphone permission denied', () => {
    expect(classifyCallError(new Error('NotAllowedError: Permission denied for audio'))).toBe('microphone_permission_denied')
  })

  it('classifies media acquisition failure', () => {
    expect(classifyCallError(new Error('NotFoundError: Requested device not found'))).toBe('media_acquisition_failed')
  })

  it('classifies WebSocket connection failure as signaling timeout', () => {
    expect(classifyCallError(new Error('WebSocket connection failed'))).toBe('signaling_timeout')
  })

  it('returns unknown for unrecognized errors', () => {
    expect(classifyCallError(new Error('Something completely unexpected'))).toBe('unknown')
  })

  it('handles non-Error values', () => {
    expect(classifyCallError('Signaling timeout')).toBe('signaling_timeout')
    expect(classifyCallError(42)).toBe('unknown')
  })
})
