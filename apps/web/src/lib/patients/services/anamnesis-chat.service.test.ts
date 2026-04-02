import { describe, it, expect, vi } from 'vitest'
import * as service from './anamnesis-chat.service'

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        startChat: () => ({
          sendMessage: async (prompt: string) => ({
            response: {
              text: () => prompt.includes('FINALIZAR_INTERVENCION')
                ? 'FINALIZAR_INTERVENCION Gracias, hemos terminado.'
                : '¿Cómo te sientes hoy?'
            }
          })
        })
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
})
