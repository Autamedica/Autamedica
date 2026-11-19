import { assertEquals } from '@std/assert'
import { getMercadoPagoMarketToken } from '../_shared/mercadopago-market-token.ts'

Deno.test('MercadoPago market credentials never mix ARS with BRL', () => {
  const keys: Record<string, string> = {
    MERCADOPAGO_ACCESS_TOKEN_BR: 'br-only',
    MERCADOPAGO_ACCESS_TOKEN_AR: 'ar-only',
    MERCADOPAGO_ACCESS_TOKEN: 'old-unsafe-generic',
  }
  const read = (key: string) => keys[key]
  assertEquals(getMercadoPagoMarketToken('BRL', read), 'br-only')
  assertEquals(getMercadoPagoMarketToken('ARS', read), 'ar-only')
})

Deno.test('MercadoPago market credentials fail closed if a market is not configured', () => {
  const read = (key: string) => key === 'MERCADOPAGO_ACCESS_TOKEN'
    ? 'generic-must-not-be-used'
    : undefined
  assertEquals(getMercadoPagoMarketToken('BRL', read), null)
  assertEquals(getMercadoPagoMarketToken('ARS', read), null)
})
