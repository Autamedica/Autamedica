import { describe, expect, it } from 'vitest'
import {
  createGuestQueueRecoveryToken,
  hashGuestQueueRecoveryToken,
  verifyGuestQueueRecoveryToken,
} from './guest-queue-recovery'

describe('pharmacy guest queue recovery credentials', () => {
  it('generates unpredictable 256-bit secrets distinct per request', () => {
    const first = createGuestQueueRecoveryToken()
    const second = createGuestQueueRecoveryToken()
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(second).toMatch(/^[0-9a-f]{64}$/)
    expect(second).not.toBe(first)
  })

  it('never matches another request or a modified token hash', async () => {
    const token = createGuestQueueRecoveryToken()
    const other = createGuestQueueRecoveryToken()
    const digest = await hashGuestQueueRecoveryToken(token)
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(digest).not.toBe(token)
    expect(await verifyGuestQueueRecoveryToken(token, digest)).toBe(true)
    expect(await verifyGuestQueueRecoveryToken(other, digest)).toBe(false)
    expect(await verifyGuestQueueRecoveryToken('bad', digest)).toBe(false)
    expect(await verifyGuestQueueRecoveryToken(token, 'bad')).toBe(false)
  })
})
