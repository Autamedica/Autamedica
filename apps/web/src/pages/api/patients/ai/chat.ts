/**
 * POST /api/patients/ai/chat
 *
 * Placeholder echo endpoint para el chat de IA del portal de pacientes.
 * Recibe mensajes y devuelve un echo del ultimo mensaje del usuario.
 * Sera reemplazado con integracion real al provider de IA.
 */

import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

interface ChatMessage {
  role: string
  content: string
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const messages = Array.isArray(body.messages) ? (body.messages as ChatMessage[]) : []

    if (messages.length === 0) {
      return json({ ok: false, error: 'messages_required' }, 400)
    }

    const lastUser = messages
      .filter((m) => m.role === 'user')
      .pop()

    const reply = lastUser?.content
      ? `Auta: recibi tu mensaje: "${lastUser.content}"`
      : 'Auta: no encontre un mensaje de usuario.'

    return json({ ok: true, data: { reply } })
  } catch (err) {
    logger.error('[API] patients/ai/chat error', err as Error)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
}
