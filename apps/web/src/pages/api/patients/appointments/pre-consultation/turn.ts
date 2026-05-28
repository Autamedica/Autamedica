/* eslint-disable @typescript-eslint/no-explicit-any */
import type { APIRoute } from 'astro'
import { logger } from '@autamedica/shared'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { createAstroAdminClient } from '@/lib/supabase'
import { resolveServerEnv } from '@/lib/patients/server/ai-provider'

interface TurnHistoryItem {
  question: string
  answer: string
}

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const POST: APIRoute = async ({ request, locals }) => {
  const context = await resolvePatientContext(request, locals)
  if (!context) return json({ success: false, error: 'unauthorized' }, 401)

  try {
    const raw = await request.json().catch(() => ({}))
    const { preconsultationId, turnIndex = 0, transcript = '', history = [] } = raw as {
      preconsultationId?: string
      turnIndex: number
      transcript: string
      history: TurnHistoryItem[]
    }

    if (!transcript.trim()) {
      return json({ success: false, error: 'missing_transcript' }, 400)
    }

    const admin = createAstroAdminClient(locals.runtime?.env)
    const geminiKey = resolveServerEnv('GEMINI_API_KEY')

    if (!geminiKey) {
      logger.warn('[pre-consultation/turn] GEMINI_API_KEY not configured. Falling back to rule-based parser.')
    }

    const currentHistory = [...history, { question: getQuestionForIndex(turnIndex), answer: transcript }]
    const isLastTurn = turnIndex >= 2 || detectCriticalRedFlags(transcript)

    let nextQuestion = ''
    let status = 'in_progress'
    let summary: Record<string, unknown> | null = null

    if (isLastTurn) {
      status = 'completed'
      summary = await generateArgenteSummary(geminiKey, currentHistory)
      
      // Si tenemos preconsultationId, guardamos el resultado en la base de datos
      if (preconsultationId) {
        try {
          const { error: updateError } = await admin
            .from('appointment_preconsultations' as never)
            .update({
              status: 'completed',
              extraction_summary: summary as any,
              updated_at: new Date().toISOString()
            } as never)
            .eq('id', preconsultationId)
          if (updateError) throw updateError
        } catch (err) {
          logger.error('[pre-consultation/turn] Failed to save completed preconsultation', err)
        }
      }
    } else {
      nextQuestion = await getNextSemiologicalQuestion(geminiKey, currentHistory)
    }

    return json({
      success: true,
      data: {
        preconsultationId: preconsultationId ?? 'draft-session',
        status,
        nextQuestion: status === 'completed' ? '' : nextQuestion,
        summary
      }
    })

  } catch (err) {
    logger.error('[pre-consultation/turn] Turn processing failed', err)
    return json({ success: false, error: err instanceof Error ? err.message : 'turn_failed' }, 500)
  }
}

// ─── Auxiliares Semiológicos y Consultas a Gemini ─────────────────────

function getQuestionForIndex(index: number): string {
  const questions = [
    '¿Cuál es el motivo principal de tu consulta hoy?',
    '¿Cuándo comenzó este síntoma y cómo evolucionó?',
    '¿Hay algo que alivie o empeore el síntoma, o tenés algún otro malestar asociado?'
  ]
  return questions[index] ?? '¿Querés agregar algún otro detalle?'
}

function detectCriticalRedFlags(text: string): boolean {
  const normalized = text.toLowerCase()
  const criticalTerms = [
    'pecho', 'opresion', 'brazo izquierdo', 'mandibula', 'falta de aire', 'aire',
    'desmayo', 'sincope', 'perdida de conocimiento', 'sangre', 'vomito sangre',
    'melena', 'rigidez nuca', 'nuca', 'focal', 'paralisis'
  ]
  return criticalTerms.some(term => normalized.includes(term))
}

async function getNextSemiologicalQuestion(apiKey: string | undefined, history: TurnHistoryItem[]): Promise<string> {
  if (!apiKey) {
    // Fallback si no hay API Key de Gemini
    return '¿Podrías describirme con más detalle cómo es la intensidad y si se extiende hacia otra parte del cuerpo?'
  }

  try {
    const formattedHistory = history.map(h => `P: ${h.question}\nR: ${h.answer}`).join('\n\n')
    const prompt = `
    Rol: Residente de medicina (R4) especializado en semiología médica (Argente-Álvarez).
    
    Teniendo en cuenta el siguiente diálogo preconsulta con el paciente:
    ${formattedHistory}
    
    Tu objetivo es formular la siguiente pregunta médica de manera muy humana, corta y directa en español rioplatense/latinoamericano para recolectar datos clave que le falten al médico para armar el ALICIADO (Aparición, Localización, Intensidad, Carácter, Irradiación, Atenuantes/Agravantes).
    
    Reglas:
    - Escribí SOLO la pregunta que le vas a hacer al paciente (máximo 15 palabras).
    - No uses saludos ni explicaciones. Directo a la pregunta.
    - Ejemplo: "¿El dolor se extiende hacia la espalda o el brazo?" o "¿Cuándo empezó exactamente este malestar?".
    `

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 }
      })
    })

    const data = await response.json()
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    return text || '¿Podrías contarme un poco más sobre la intensidad de este dolor?'
  } catch (err) {
    logger.error('[pre-consultation/turn] Gemini next question request failed', err)
    return '¿Podrías decirme qué alivia o empeora este malestar?'
  }
}

async function generateArgenteSummary(apiKey: string | undefined, history: TurnHistoryItem[]): Promise<Record<string, unknown>> {
  const fallbackSummary = {
    clinicalNarrative: history.map(h => h.answer).join(' '),
    safetyFlags: [],
    redFlags: [],
    clinicianQuestions: ['¿Cuándo comenzó exactamente el dolor?', '¿Existen antecedentes cardíacos familiares?']
  }

  if (!apiKey) return fallbackSummary

  try {
    const formattedHistory = history.map(h => `Pregunta: ${h.question}\nRespuesta: ${h.answer}`).join('\n\n')
    const prompt = `
    Rol: Residente avanzado R4 de medicina interna realizando una extracción semiológica de preconsulta para el médico clínico de guardia.
    Misión: Sintetizar el relato del paciente en un formato estructurado de semiología senior basada en Argente-Álvarez.
    
    Diálogo con el paciente:
    ${formattedHistory}
    
    Generá una respuesta en formato JSON estricto que cumpla exactamente con esta estructura:
    {
      "clinicalNarrative": "Frase marco de 2 a 3 líneas en español con el ALICIADO semiológico detallado de forma profesional.",
      "safetyFlags": ["Alertas críticas si las hay, por ejemplo alergias o automedicación severa. Si no hay, devolver array vacío."],
      "redFlags": ["Signos de alarma detectados en base a la evidencia. Si no hay, devolver array vacío."],
      "clinicianQuestions": ["2 preguntas clave y dirigidas de razonamiento clínico para que el médico le haga al paciente en la consulta."]
    }
    `

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      })
    })

    const data = await response.json()
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
    if (rawText) {
      return JSON.parse(rawText)
    }
    return fallbackSummary
  } catch (err) {
    logger.error('[pre-consultation/turn] Gemini summary extraction failed', err)
    return fallbackSummary
  }
}
