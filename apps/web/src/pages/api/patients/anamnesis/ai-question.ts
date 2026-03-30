/**
 * API: AI-driven initial question for anamnesis.
 * Patient describes chief complaint in free text → Gemini generates
 * targeted follow-up questions based on clinical reasoning.
 *
 * POST /api/patients/anamnesis/ai-question
 * Body: { chiefComplaint: string, existingSections?: string[] }
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { logger } from '@autamedica/shared'
import {
  resolveExtractionTarget,
  resolveServerEnv,
  isAnamnesisExtractionConfigured,
} from '@/lib/patients/server/ai-provider'
import { createAstroAdminClient } from '@/lib/supabase'
import { anamnesisExtractionRepo } from '@/lib/patients/lib/repos/anamnesis-extraction.repo'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Max AI question calls per patient per day (shared with extract endpoint) */
const DAILY_AI_QUESTION_LIMIT = 5

const SYSTEM_PROMPT = `Sos un asistente médico de AutaMedica. El paciente acaba de describir su motivo de consulta.
Tu tarea: generar 4–8 preguntas de seguimiento clínicamente relevantes basadas en lo que describió.

Reglas:
- Preguntas cortas, claras, en español argentino informal (voseo)
- Cada pregunta con tipo: "open" (texto libre), "closed" (sí/no), "scale" (1-10), "select" (opciones)
- Para "select": incluir array "options" con 2-4 opciones + "Otro"
- Prioridad: "critical" (banderas rojas), "high" (diagnóstico diferencial), "medium" (contexto)
- NO diagnosticar, NO sugerir tratamientos
- Focalizate en: temporalidad, intensidad, factores agravantes/atenuantes, síntomas asociados, antecedentes relevantes
- Si hay banderas rojas (dolor torácico, dificultad respiratoria, pérdida de consciencia), priorizalas

Responder SOLO en JSON válido:
{
  "questions": [
    {
      "id": "ai_q1",
      "question": "¿Hace cuánto tenés este dolor?",
      "type": "open",
      "priority": "high",
      "targetSection": "motivo_consulta",
      "rationale": "Determinar cronicidad"
    }
  ],
  "detectedSections": ["motivo_consulta", "cardiovascular"],
  "urgencyLevel": "normal" | "attention" | "urgent"
}`

export const POST: APIRoute = async ({ request, locals }) => {
  // primeRuntimeEnv is called by middleware on every request — no need to repeat here
  const context = await resolvePatientContext(request, locals)
  if (!context) return json({ success: false, error: 'unauthorized' }, 401)

  const raw = await request.json().catch(() => ({}))
  const chiefComplaint = typeof raw.chiefComplaint === 'string' ? raw.chiefComplaint.trim() : ''

  if (!chiefComplaint || chiefComplaint.length < 5) {
    return json({ success: false, error: 'chief_complaint_too_short' }, 400)
  }

  if (chiefComplaint.length > 2000) {
    return json({ success: false, error: 'chief_complaint_too_long' }, 400)
  }

  // DB-backed rate limit: reuses extraction count (both endpoints call Gemini)
  const admin = createAstroAdminClient()
  const todayCount = await anamnesisExtractionRepo.countToday(admin, context.patientId)
  if (todayCount >= DAILY_AI_QUESTION_LIMIT) {
    return json({ success: false, error: 'rate_limit_exceeded' }, 429)
  }

  if (!isAnamnesisExtractionConfigured()) {
    return json({ success: false, error: 'ai_not_configured' }, 503)
  }

  const target = resolveExtractionTarget()
  if (!target) return json({ success: false, error: 'ai_not_configured' }, 503)

  try {
    const userMessage = `Motivo de consulta del paciente:\n"${chiefComplaint}"`
    let aiResponse: string

    if (target.providerName === 'gemini') {
      const apiKey = resolveServerEnv('GEMINI_API_KEY') ?? ''
      const model = target.modelName
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 32768,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 2048 },
          },
        }),
      })

      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'unknown')
        logger.error('[ai-question] Gemini error', { status: resp.status, body: errText })
        return json({ success: false, error: 'ai_provider_error' }, 502)
      }

      const geminiResult = await resp.json()
      aiResponse = geminiResult?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      if (!aiResponse) {
        logger.warn('[ai-question] Gemini returned empty response (thinking tokens exceeded output budget)', {
          finishReason: geminiResult?.candidates?.[0]?.finishReason,
          thoughtsTokens: geminiResult?.usageMetadata?.thoughtsTokenCount,
        })
        return json({ success: true, data: { questions: [], detectedSections: [], urgencyLevel: 'normal' } })
      }
    } else {
      // OpenAI fallback
      const apiKey = resolveServerEnv('OPENAI_API_KEY') ?? ''
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: target.modelName,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.3,
          max_tokens: 1500,
          response_format: { type: 'json_object' },
        }),
      })

      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'unknown')
        logger.error('[ai-question] OpenAI error', { status: resp.status, body: errText })
        return json({ success: false, error: 'ai_provider_error' }, 502)
      }

      const openaiResult = await resp.json()
      aiResponse = openaiResult?.choices?.[0]?.message?.content ?? ''
    }

    // Parse JSON response
    const parsed = JSON.parse(aiResponse)
    const questions = Array.isArray(parsed.questions) ? parsed.questions : []
    const detectedSections = Array.isArray(parsed.detectedSections) ? parsed.detectedSections : []
    const urgencyLevel = ['normal', 'attention', 'urgent'].includes(parsed.urgencyLevel)
      ? parsed.urgencyLevel
      : 'normal'

    logger.info('[ai-question] Generated questions', {
      questionsCount: questions.length,
      detectedSections,
      urgencyLevel,
    })

    return json({
      success: true,
      data: { questions, detectedSections, urgencyLevel },
    })
  } catch (err) {
    logger.error('[ai-question] Failed', err)
    return json({ success: false, error: 'ai_question_failed' }, 500)
  }
}
