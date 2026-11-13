/**
 * API: AI-driven initial question for anamnesis.
 * Patient describes chief complaint in free text -> Gemini generates
 * targeted follow-up questions based on clinical reasoning.
 *
 * POST /api/patients/anamnesis/ai-question
 * Body: { chiefComplaint: string, existingSections?: string[] }
 */
import type { APIRoute } from 'astro'
import { resolvePatientContext } from '@/lib/patients/api/patient-context'
import { logger } from '@autamedica/shared'
import {
  resolveQuestionsTarget,
  resolveServerEnv,
  isAnamnesisExtractionConfigured,
} from '@/lib/patients/server/ai-provider'
import { createAstroAdminClient } from '@/lib/supabase'
import { createAnamnesisExtractionAdapter } from '@/lib/patients/lib/repos/anamnesis-extraction.adapter'

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Max AI question calls per patient per day (shared with extract endpoint) */
const DAILY_AI_QUESTION_LIMIT = 5

const SYSTEM_PROMPT = `Sos un asistente medico de AutaMedica. El paciente acaba de describir su motivo de consulta.
Tu tarea: generar 4-8 preguntas de seguimiento clinicamente relevantes basadas en lo que describio.

Reglas:
- Preguntas cortas, claras, en espanol argentino informal (voseo)
- Cada pregunta con tipo: "open" (texto libre), "closed" (si/no), "scale" (1-10), "select" (opciones)
- Para "select": incluir array "options" con 2-4 opciones + "Otro"
- Prioridad: "critical" (banderas rojas), "high" (diagnostico diferencial), "medium" (contexto)
- NO diagnosticar, NO sugerir tratamientos
- Focalizate en: temporalidad, intensidad, factores agravantes/atenuantes, sintomas asociados, antecedentes relevantes
- Si hay banderas rojas (dolor toracico, dificultad respiratoria, perdida de consciencia), priorizalas

Responder SOLO en JSON valido:
{
  "questions": [
    {
      "id": "ai_q1",
      "question": "Hace cuanto tenes este dolor?",
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

  const admin = createAstroAdminClient(locals.runtime?.env)
  const anamnesisExtractionRepo = createAnamnesisExtractionAdapter(admin)
  const todayCount = await anamnesisExtractionRepo.countToday(context.patientId)
  if (todayCount >= DAILY_AI_QUESTION_LIMIT) {
    return json({ success: false, error: 'rate_limit_exceeded' }, 429)
  }

  if (!isAnamnesisExtractionConfigured()) {
    return json({ success: false, error: 'ai_not_configured' }, 503)
  }

  const target = resolveQuestionsTarget()
  if (!target) return json({ success: false, error: 'ai_not_configured' }, 503)

  try {
    const userMessage = `Motivo de consulta del paciente:\n"${chiefComplaint}"`
    const apiKey = resolveServerEnv('GEMINI_API_KEY') ?? ''

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${target.modelName}:generateContent`

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
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
      logger.error('[ai-question] Gemini error', { status: resp.status, body: errText, model: target.modelName })
      return json({ success: false, error: 'ai_provider_error' }, 502)
    }

    const geminiResult = await resp.json() as Record<string, unknown>
    const aiResponse = (geminiResult as Record<string, unknown>)?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    if (!aiResponse) {
      logger.warn('[ai-question] Gemini returned empty response', {
        finishReason: (geminiResult as Record<string, unknown>)?.candidates?.[0]?.finishReason,
      })
      return json({ success: true, data: { questions: [], detectedSections: [], urgencyLevel: 'attention', review_status: 'unverified', requires_manual_review: true } })
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(aiResponse as string)
    } catch {
      logger.warn('[ai-question] AI returned non-JSON response', { aiResponse: (aiResponse as string).slice(0, 200) })
      return json({ success: true, data: { questions: [], detectedSections: [], urgencyLevel: 'attention', review_status: 'unverified', requires_manual_review: true } })
    }
    const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : []
    const questions = rawQuestions.filter((q: Record<string, unknown>) =>
      typeof q.id === 'string' &&
      typeof q.question === 'string' && q.question.length > 0 &&
      typeof q.type === 'string' && ['open', 'closed', 'scale', 'select'].includes(q.type as string) &&
      typeof q.priority === 'string'
    )
    const detectedSections = Array.isArray(parsed.detectedSections)
      ? (parsed.detectedSections as unknown[]).filter((s): s is string => typeof s === 'string')
      : []
    const rawUrgency = typeof parsed.urgencyLevel === 'string' ? parsed.urgencyLevel : ''
    const urgencyLevel = ['normal', 'attention', 'urgent'].includes(rawUrgency)
      ? rawUrgency
      : 'normal'

    if (questions.length < rawQuestions.length) {
      logger.warn('[ai-question] Filtered malformed questions', {
        total: rawQuestions.length,
        valid: questions.length,
      })
    }

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
