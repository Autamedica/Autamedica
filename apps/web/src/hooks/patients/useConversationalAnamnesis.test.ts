import { describe, expect, it } from 'vitest'
import { evaluateCheckpoint, PARTIAL_AFTER_N_ANSWERS } from './useConversationalAnamnesis'

describe('evaluateCheckpoint', () => {
  it('returns null when below threshold and partial not fired', () => {
    expect(evaluateCheckpoint(0, false)).toBeNull()
    expect(evaluateCheckpoint(14, false)).toBeNull()
  })

  it('returns partial when reaching threshold', () => {
    expect(evaluateCheckpoint(PARTIAL_AFTER_N_ANSWERS, false)).toBe('partial')
  })

  it('returns partial when exceeding threshold (first check)', () => {
    expect(evaluateCheckpoint(20, false)).toBe('partial')
  })

  it('returns null when partial already fired even if above threshold', () => {
    expect(evaluateCheckpoint(PARTIAL_AFTER_N_ANSWERS, true)).toBeNull()
    expect(evaluateCheckpoint(50, true)).toBeNull()
  })

  it('returns null when exactly at threshold - 1', () => {
    expect(evaluateCheckpoint(PARTIAL_AFTER_N_ANSWERS - 1, false)).toBeNull()
  })

  it('PARTIAL_AFTER_N_ANSWERS is 15', () => {
    expect(PARTIAL_AFTER_N_ANSWERS).toBe(15)
  })
})
