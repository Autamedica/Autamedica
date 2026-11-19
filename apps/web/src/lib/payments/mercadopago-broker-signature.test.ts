import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/runtime-env', () => ({
  resolveGuestSecret: (env?: Record<string, unknown> | null) =>
    typeof env?.GUEST_SECRET === 'string' ? env.GUEST_SECRET : null,
}))

import {
  createMercadoPagoBrokerHeaders,
  verifyMercadoPagoBrokerRequest,
} from './mercadopago-broker-signature'

describe('mercadopago-broker-signature', () => {
  const env = { GUEST_SECRET: 'super-secret-broker-key-2026' }

  it('signs and verifies a valid broker request round-trip', async () => {
    const rawBody = JSON.stringify({ payment_id: 'mp-123', amount_cents: 15000 })
    const headers = await createMercadoPagoBrokerHeaders(
      'POST',
      '/api/payments/mercadopago/broker',
      rawBody,
      env,
    )

    expect(headers['x-autamedica-broker-signature']).toMatch(/^[0-9a-f]{64}$/)
    expect(headers['Cache-Control']).toBe('no-store')

    const req = new Request('https://autamedica.com/api/payments/mercadopago/broker', {
      method: 'POST',
      headers,
      body: rawBody,
    })

    await expect(verifyMercadoPagoBrokerRequest(req, rawBody, env)).resolves.toBe(true)
  })

  it('rejects tampered body, wrong secret, or expired timestamp', async () => {
    const rawBody = JSON.stringify({ payment_id: 'mp-123' })
    const headers = await createMercadoPagoBrokerHeaders(
      'POST',
      '/api/payments/mercadopago/broker',
      rawBody,
      env,
    )

    const tamperedReq = new Request('https://autamedica.com/api/payments/mercadopago/broker', {
      method: 'POST',
      headers,
      body: JSON.stringify({ payment_id: 'mp-999' }),
    })
    await expect(
      verifyMercadoPagoBrokerRequest(tamperedReq, JSON.stringify({ payment_id: 'mp-999' }), env),
    ).resolves.toBe(false)

    const validReq = new Request('https://autamedica.com/api/payments/mercadopago/broker', {
      method: 'POST',
      headers,
      body: rawBody,
    })
    await expect(
      verifyMercadoPagoBrokerRequest(validReq, rawBody, { GUEST_SECRET: 'wrong-secret' }),
    ).resolves.toBe(false)

    const expiredReq = new Request('https://autamedica.com/api/payments/mercadopago/broker', {
      method: 'POST',
      headers: {
        ...headers,
        'x-autamedica-broker-timestamp': String(Math.floor(Date.now() / 1000) - 600),
      },
      body: rawBody,
    })
    await expect(verifyMercadoPagoBrokerRequest(expiredReq, rawBody, env)).resolves.toBe(false)
  })

  it('throws when signing secret is missing', async () => {
    await expect(
      createMercadoPagoBrokerHeaders('POST', '/api/payments/mercadopago/broker', '{}', {}),
    ).rejects.toThrow('mercadopago_broker_signing_secret_missing')
  })
})
