import { describe, expect, it } from 'vitest'
import { runWithSerializedAuthLock } from '../client/supabase'

describe('runWithSerializedAuthLock', () => {
  it('serializes auth operations that use the same lock name', async () => {
    const executionOrder: string[] = []

    const first = runWithSerializedAuthLock('supabase-auth-token', 0, async () => {
      executionOrder.push('first:start')
      await new Promise((resolve) => setTimeout(resolve, 25))
      executionOrder.push('first:end')
      return 'first-result'
    })

    const second = runWithSerializedAuthLock('supabase-auth-token', 0, async () => {
      executionOrder.push('second:start')
      executionOrder.push('second:end')
      return 'second-result'
    })

    await expect(Promise.all([first, second])).resolves.toEqual([
      'first-result',
      'second-result',
    ])

    expect(executionOrder).toEqual([
      'first:start',
      'first:end',
      'second:start',
      'second:end',
    ])
  })

  it('releases the queue even when a previous operation fails', async () => {
    const executionOrder: string[] = []

    const first = runWithSerializedAuthLock('supabase-auth-token', 0, async () => {
      executionOrder.push('first:start')
      throw new Error('boom')
    })

    const second = runWithSerializedAuthLock('supabase-auth-token', 0, async () => {
      executionOrder.push('second:start')
      executionOrder.push('second:end')
      return 'second-result'
    })

    await expect(first).rejects.toThrow('boom')
    await expect(second).resolves.toBe('second-result')
    expect(executionOrder).toEqual(['first:start', 'second:start', 'second:end'])
  })
})
