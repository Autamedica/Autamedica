import { describe, expect, it } from 'vitest'
import {
  CENTS_PER_MAJOR_UNIT,
  centsToMajorUnit,
  majorUnitToCents,
  formatArsFromCents,
  formatBrlFromCents,
} from './money'

describe('payments/money', () => {
  it('converts between cents and major currency units without floating-point drift', () => {
    expect(CENTS_PER_MAJOR_UNIT).toBe(100)
    expect(centsToMajorUnit(15000)).toBe(150)
    expect(centsToMajorUnit(1999)).toBe(19.99)
    expect(majorUnitToCents(19.99)).toBe(1999)
    expect(majorUnitToCents(0.1 + 0.2)).toBe(30)
  })

  it('formats ARS from cents and falls back safely for null/zero/negative values', () => {
    expect(formatArsFromCents(null)).toBe('Valor a confirmar')
    expect(formatArsFromCents(undefined)).toBe('Valor a confirmar')
    expect(formatArsFromCents(0)).toBe('Valor a confirmar')
    expect(formatArsFromCents(-500)).toBe('Valor a confirmar')

    const formatted = formatArsFromCents(2500000)
    expect(formatted).toContain('25.000')
  })

  it('formats BRL from cents with two decimals and falls back to R$ 0,00', () => {
    expect(formatBrlFromCents(null)).toBe('R$ 0,00')
    expect(formatBrlFromCents(undefined)).toBe('R$ 0,00')
    expect(formatBrlFromCents(0)).toBe('R$ 0,00')
    expect(formatBrlFromCents(-100)).toBe('R$ 0,00')

    const formatted = formatBrlFromCents(14990)
    expect(formatted).toContain('149,90')
  })
})
