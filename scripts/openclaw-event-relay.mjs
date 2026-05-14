#!/usr/bin/env node
import http from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

const HOST = process.env.OPENCLAW_EVENT_RELAY_HOST || '127.0.0.1'
const PORT = Number(process.env.OPENCLAW_EVENT_RELAY_PORT || '18791')
const AUTHORIZE_URL =
  process.env.AUTAMEDICA_OPENCLAW_AUTHORIZE_URL ||
  'https://doctor.autamedica.com/api/openclaw/authorize'
const OPENCLAW_BIN = process.env.OPENCLAW_CLI_PATH || 'openclaw'
const DEFAULT_ACCOUNT = process.env.OPENCLAW_ACCOUNT || 'autamedica'
const DEFAULT_CHANNEL = process.env.OPENCLAW_CHANNEL || 'whatsapp'
const REQUIRED_SCOPE = process.env.OPENCLAW_REQUIRED_SCOPE || 'openclaw:send'
const RELAY_USER_AGENT = process.env.OPENCLAW_EVENT_RELAY_USER_AGENT || 'AutaMedica-OpenClaw-Relay/1.0'

const MAX_BODY_BYTES = Number(process.env.OPENCLAW_EVENT_RELAY_MAX_BODY_BYTES || '32768')
const MAX_MESSAGE_CHARS = Number(process.env.OPENCLAW_EVENT_RELAY_MAX_MESSAGE_CHARS || '4000')
const REQUEST_TIMEOUT_MS = Number(process.env.OPENCLAW_EVENT_RELAY_TIMEOUT_MS || '30000')
const SEND_TIMEOUT_MS = Number(process.env.OPENCLAW_EVENT_RELAY_SEND_TIMEOUT_MS || '30000')
const RATE_LIMIT_WINDOW_MS = Number(process.env.OPENCLAW_EVENT_RELAY_RATE_WINDOW_MS || '60000')
const RATE_LIMIT_MAX = Number(process.env.OPENCLAW_EVENT_RELAY_RATE_MAX || '60')

const ALLOWED_EVENTS = new Set([
  'appointment.payment_approved',
  'appointment.payment_confirmed_patient',
  'prescription.issued',
  'dispatch.offer',
  'dispatch.escalated',
  'anamnesis.reminder',
])

const buckets = new Map()

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function cleanPhone(value) {
  return String(value || '').replace(/@s\.whatsapp\.net$/i, '').replace(/^whatsapp:/i, '').replace(/[^\d]/g, '')
}

function isRateLimited(key) {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now - bucket.startedAt > RATE_LIMIT_WINDOW_MS) {
    buckets.set(key, { startedAt: now, count: 1 })
    return false
  }
  bucket.count += 1
  return bucket.count > RATE_LIMIT_MAX
}

async function readJsonBody(req) {
  let total = 0
  const chunks = []
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY_BYTES) {
      throw new Error('body_too_large')
    }
    chunks.push(chunk)
  }
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  return JSON.parse(raw)
}

async function authorize(apiKey) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(AUTHORIZE_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'user-agent': RELAY_USER_AGENT,
      },
      body: JSON.stringify({ scope: REQUIRED_SCOPE }),
      signal: controller.signal,
    })

    if (!response.ok) return { ok: false, status: response.status }
    const payload = await response.json().catch(() => null)
    return { ok: payload?.data?.authorized === true, status: response.status }
  } finally {
    clearTimeout(timeout)
  }
}

async function sendViaOpenClaw({ to, message, channel, accountId }) {
  const args = [
    'message',
    'send',
    '--channel',
    channel,
    '--target',
    to,
    '--message',
    message,
    '--account',
    accountId,
    '--json',
  ]

  const { stdout, stderr } = await execFileAsync(OPENCLAW_BIN, args, { timeout: SEND_TIMEOUT_MS })
  if (stderr?.toLowerCase().includes('error')) {
    throw new Error(stderr.trim())
  }

  try {
    const payload = JSON.parse(stdout)
    if (payload?.error) throw new Error(String(payload.error))
  } catch (error) {
    if (error instanceof SyntaxError) return { raw: stdout }
    throw error
  }

  return { raw: stdout }
}

async function handleSend(req, res) {
  const apiKey = req.headers['x-api-key']
  if (typeof apiKey !== 'string' || !apiKey) {
    return json(res, 401, { ok: false, error: 'missing_api_key' })
  }

  const rateKey = apiKey.slice(0, 18)
  if (isRateLimited(rateKey)) {
    return json(res, 429, { ok: false, error: 'rate_limited' })
  }

  const auth = await authorize(apiKey)
  if (!auth.ok) {
    return json(res, auth.status === 403 ? 403 : 401, { ok: false, error: 'unauthorized' })
  }

  let body
  try {
    body = await readJsonBody(req)
  } catch {
    return json(res, 400, { ok: false, error: 'invalid_json' })
  }

  const event = String(body.event || '')
  const channel = String(body.channel || DEFAULT_CHANNEL)
  const accountId = String(body.accountId || DEFAULT_ACCOUNT)
  const to = cleanPhone(body.to)
  const message = String(body.message || '').trim()

  if (!ALLOWED_EVENTS.has(event)) return json(res, 400, { ok: false, error: 'invalid_event' })
  if (channel !== 'whatsapp') return json(res, 400, { ok: false, error: 'invalid_channel' })
  if (accountId !== DEFAULT_ACCOUNT) return json(res, 400, { ok: false, error: 'invalid_account' })
  if (to.length < 8) return json(res, 400, { ok: false, error: 'invalid_recipient' })
  if (!message || message.length > MAX_MESSAGE_CHARS) return json(res, 400, { ok: false, error: 'invalid_message' })

  try {
    const result = await sendViaOpenClaw({ to, message, channel, accountId })
    return json(res, 200, { ok: true, event, to, raw: result.raw })
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'send_failed'
    console.error('[openclaw-event-relay] send failed', { event, to, detail })
    return json(res, 502, { ok: false, error: 'send_failed' })
  }
}

const server = http.createServer((req, res) => {
  Promise.resolve()
    .then(async () => {
      if (req.method === 'GET' && req.url === '/health') {
        return json(res, 200, { ok: true, service: 'openclaw-event-relay' })
      }
      if (req.method === 'POST' && req.url === '/send') {
        return handleSend(req, res)
      }
      return json(res, 404, { ok: false, error: 'not_found' })
    })
    .catch((error) => {
      console.error('[openclaw-event-relay] request failed', error)
      json(res, 500, { ok: false, error: 'internal_error' })
    })
})

server.listen(PORT, HOST, () => {
  console.log(`[openclaw-event-relay] listening on http://${HOST}:${PORT}`)
  console.log(`[openclaw-event-relay] authorize URL: ${AUTHORIZE_URL}`)
})
