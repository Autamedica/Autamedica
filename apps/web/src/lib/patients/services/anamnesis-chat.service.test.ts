import { describe, it, expect, vi } from 'vitest'
import * as service from './anamnesis-chat.service'

let lastStartChatConfig: any = null

process.env.GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? 'test-gemini-key'

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        startChat: (config: any) => {
          lastStartChatConfig = config
          return {
            sendMessage: async (prompt: string) => ({
              response: {
                text: () => prompt.includes('Responde al mensaje del paciente: "FINALIZAR_INTERVENCION"')
                  ? 'FINALIZAR_INTERVENCION Gracias, hemos terminado.'
                  : '¿Cómo te sientes hoy?'
              }
            })
          }
        }
      };
    }
  }
}))

describe('Anamnesis Chat Service', () => {
  it('debe procesar un mensaje normal y devolver isFinished: false', async () => {
    const history = [{ role: 'user' as const, content: 'Hola' }]
    const result = await service.processAnamnesisChat('Hola', history, 'partial')

    expect(result.reply).toBe('¿Cómo te sientes hoy?')
    expect(result.isFinished).toBe(false)
  })

  it('debe detectar la señal de corte y devolver isFinished: true', async () => {
    const history = [{ role: 'user' as const, content: 'Ya tengo todo' }]
    // Forzamos un mensaje que contenga el token de corte
    const result = await service.processAnamnesisChat('FINALIZAR_INTERVENCION', history, 'partial')

    expect(result.isFinished).toBe(true)
    expect(result.reply).toBe('Gracias, hemos terminado.')
  })

  it('descarta mensajes iniciales del assistant para no romper Gemini chat history', async () => {
    lastStartChatConfig = null

    await service.processAnamnesisChat(
      'Me duele la cabeza',
      [
        { role: 'assistant', content: 'Estoy revisando tu historia clínica.' },
        { role: 'user', content: 'Me duele la cabeza.' },
        { role: 'assistant', content: '¿Sentís náuseas?' },
      ],
      'partial',
    )

    expect(lastStartChatConfig).toBeTruthy()
    expect(lastStartChatConfig.history[0].role).toBe('user')
    expect(lastStartChatConfig.history).toEqual([
      { role: 'user', parts: [{ text: 'Me duele la cabeza.' }] },
      { role: 'model', parts: [{ text: '¿Sentís náuseas?' }] },
    ])
  })

  it('usa historial vacío si no hubo mensajes del usuario todavía', async () => {
    lastStartChatConfig = null

    await service.processAnamnesisChat(
      'Necesito agregar un dato',
      [
        { role: 'assistant', content: 'Estoy revisando tu historia clínica.' },
        { role: 'assistant', content: 'Contame un poco más.' },
      ],
      'partial',
    )

    expect(lastStartChatConfig).toBeTruthy()
    expect(lastStartChatConfig.history).toEqual([])
  })
})
