import type { BillingCurrency } from './billing-currency.ts'

/**
 * Each Mercado Pago access token belongs to a specific local merchant market.
 * Never reuse a generic token for ARS and BRL or infer the market from a device.
 *
 * Deploy configuration:
 * - MERCADOPAGO_ACCESS_TOKEN_AR: Argentine merchant integration
 * - MERCADOPAGO_ACCESS_TOKEN_BR: Brazilian merchant integration
 *
 * A missing market credential blocks checkout, not silently creates a
 * preference using the wrong merchant account.
 */
export function getMercadoPagoMarketToken(
  currency: BillingCurrency,
  getSecret: (name: string) => string | undefined = (name) => Deno.env.get(name),
): string | null {
  const name = currency === 'BRL' ? 'MERCADOPAGO_ACCESS_TOKEN_BR' : 'MERCADOPAGO_ACCESS_TOKEN_AR'
  return getSecret(name)?.trim() || null
}
