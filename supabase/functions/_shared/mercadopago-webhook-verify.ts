import type { BillingCurrency } from './billing-currency.ts'

export function mercadoPagoMarketSecrets(currency: BillingCurrency): {
  tokenName: string
  signatureName: string
} {
  return currency === 'BRL'
    ? { tokenName: 'MERCADOPAGO_ACCESS_TOKEN_BR', signatureName: 'MERCADOPAGO_WEBHOOK_SECRET_BR' }
    : { tokenName: 'MERCADOPAGO_ACCESS_TOKEN_AR', signatureName: 'MERCADOPAGO_WEBHOOK_SECRET_AR' }
}

/** Check the signed provider payment id; never trust a body field without HMAC. */
export async function verifyMercadoPagoMarketSignature(input: {
  signature: string | null
  requestId: string | null
  paymentId: string
  secret: string | null
}): Promise<boolean> {
  const { signature, requestId, paymentId, secret } = input
  if (!signature || !requestId || !secret || !/^\d{1,32}$/.test(paymentId)) return false

  const chunks = new Map(signature.split(',').map((p) => {
    const [key, ...rest] = p.trim().split('=')
    return [key?.trim(), rest.join('=').trim()]
  }))
  const ts = chunks.get('ts')
  const v1 = chunks.get('v1')
  if (!ts || !/^\d{1,20}$/.test(ts) || !v1 || !/^[a-f\d]{64}$/i.test(v1)) return false

  const manifest = `id:${paymentId};request-id:${requestId};ts:${ts};`
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
  )
  const signatureBytes = Uint8Array.from(v1.match(/.{2}/g)!, (x) => Number.parseInt(x, 16))
  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(manifest))
}

export function paymentAmountCents(amount: unknown): number | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null
  const cents = Math.round(amount * 100)
  if (!Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.001) return null
  return cents
}
