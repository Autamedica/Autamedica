import { describe, expect, it } from 'vitest'
import { sanitizeForTTS, segmentForTTS } from './tts-sanitizer'

describe('tts-sanitizer', () => {
  it('sanitizeForTTS removes completion tags and expands medical abbreviations', () => {
    expect(sanitizeForTTS('[ANAMNESIS_COMPLETA] TA 120 mmHg')).toBe('tensión arterial 120 milímetros de mercurio')
  })

  it('segmentForTTS splits long guided questions into shorter chunks', () => {
    const text = 'Entiendo, Eduardo. Gracias por aclararme eso. Entonces, sobre ese dolor en puntadas que sentís, ¿te pasa que el dolor te despierta por la noche o quizás lo sentís más intenso apenas te despertás a la mañana?'

    const segments = segmentForTTS(text, 90)

    expect(segments.length).toBeGreaterThan(1)
    expect(segments.every((segment) => segment.length <= 90)).toBe(true)
    expect(segments.join(' ')).toContain('dolor en puntadas')
  })
})
