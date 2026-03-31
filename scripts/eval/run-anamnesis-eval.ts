#!/usr/bin/env bun
/**
 * Runner de evaluacion para extraccion de anamnesis.
 *
 * Uso:
 *   bun scripts/eval/run-anamnesis-eval.ts              # llama a Gemini real
 *   bun scripts/eval/run-anamnesis-eval.ts --mock       # usa mock outputs (sin API)
 *   bun scripts/eval/run-anamnesis-eval.ts --case chest-pain-red-flags   # solo un caso
 *
 * Requiere GEMINI_API_KEY en el env (excepto con --mock).
 * Genera reporte en scripts/eval/results/eval-{timestamp}.md
 */

import { GOLD_STANDARD, type GoldStandardCase } from './anamnesis-gold-standard'
import { evaluateCase, computeSummary, generateMarkdownReport, type EvalSummary } from './scoring'
import { MOCK_OUTPUTS } from './mock-outputs'
import type { AnamnesisExtractionResult } from '../../apps/web/src/lib/patients/types/anamnesis-extraction'

// ── Config ──

const GEMINI_MODEL = Bun.env.EVAL_MODEL ?? 'gemini-3-flash-preview'
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const args = process.argv.slice(2)
const useMock = args.includes('--mock')
const caseFilter = args.find((_, i, a) => a[i - 1] === '--case')

// ── Importar prompt y schema de produccion ──

// Inline import para evitar dependencias de Astro path aliases
const promptPath = '../../apps/web/src/lib/patients/server/anamnesis-ai-extraction'

async function loadProductionPrompt() {
  const mod = await import(promptPath)
  return {
    systemPrompt: mod.buildAnamnesisExtractionSystemPrompt() as string,
    responseSchema: mod.getAnamnesisExtractionResponseSchema() as Record<string, unknown>,
    promptVersion: mod.ANAMNESIS_EXTRACTION_PROMPT_VERSION as string,
  }
}

// ── Llamada a Gemini ──

async function callGemini(
  systemPrompt: string,
  responseSchema: Record<string, unknown>,
  goldCase: GoldStandardCase,
): Promise<AnamnesisExtractionResult> {
  const apiKey = Bun.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY no configurada. Usa --mock para testear sin API.')

  const requestPayload = {
    version: 'anamnesis_extraction_v2' as const,
    purpose: 'extract_structured_anamnesis_without_diagnosis' as const,
    patient: {
      patientId: `eval-${goldCase.id}`,
      patientLabel: goldCase.patientLabel,
      anamnesisStatus: 'completed',
      privacyAccepted: true,
    },
    guardrails: [
      'No emitir diagnosticos ni diferenciales.',
      'No indicar tratamiento ni conducta terapeutica.',
      'No agregar sintomas ni banderas rojas que no esten en la evidencia.',
    ],
    deterministicSummary: { headline: '', narrative: [], sections: [], completedSections: goldCase.sections.length, lastUpdatedAt: null },
    sourceSections: goldCase.sections,
    bodySelections: [],
    clarificationTurns: [],
  }

  const response = await fetch(
    `${GEMINI_URL}/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{
          role: 'user',
          parts: [{
            text: [
              'DATOS DEL PACIENTE (JSON):',
              JSON.stringify(requestPayload),
              '',
              'SCHEMA DE RESPUESTA OBLIGATORIO (JSON Schema):',
              JSON.stringify(responseSchema),
              '',
              'Responde UNICAMENTE con un JSON que cumpla este schema. Sin texto adicional.',
            ].join('\n'),
          }],
        }],
        generationConfig: {
          temperature: 0,
          seed: 1,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 1024 },
        },
      }),
    },
  )

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Gemini HTTP ${response.status}: ${err.slice(0, 500)}`)
  }

  const payload = await response.json() as Record<string, unknown>
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'object') continue
    const content = (candidate as Record<string, unknown>).content as Record<string, unknown> | undefined
    const parts = content && Array.isArray(content.parts) ? content.parts : []
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      const text = (part as Record<string, unknown>).text
      if (typeof text === 'string' && text.trim()) {
        return JSON.parse(text) as AnamnesisExtractionResult
      }
    }
  }

  throw new Error('Gemini no devolvio contenido de texto')
}

// ── Cargar resultado previo mas reciente ──

async function loadPreviousSummary(): Promise<EvalSummary | undefined> {
  const { Glob } = await import('bun')
  const glob = new Glob('eval-*.json')
  const resultsDir = `${import.meta.dir}/results`

  const files: string[] = []
  for await (const file of glob.scan({ cwd: resultsDir })) {
    files.push(file)
  }
  if (files.length === 0) return undefined

  files.sort().reverse()
  const latest = files[0]
  const content = await Bun.file(`${resultsDir}/${latest}`).text()
  return JSON.parse(content) as EvalSummary
}

// ── Main ──

async function main() {
  console.log(`\n--- Anamnesis Extraction Eval ---`)
  console.log(`Mode: ${useMock ? 'MOCK' : 'LIVE (' + GEMINI_MODEL + ')'}`)

  let systemPrompt = ''
  let responseSchema: Record<string, unknown> = {}
  let promptVersion = 'mock'

  if (!useMock) {
    const prod = await loadProductionPrompt()
    systemPrompt = prod.systemPrompt
    responseSchema = prod.responseSchema
    promptVersion = prod.promptVersion
  } else {
    promptVersion = 'mock_v0'
  }

  const cases = caseFilter
    ? GOLD_STANDARD.filter(c => c.id === caseFilter)
    : GOLD_STANDARD

  if (cases.length === 0) {
    console.error(`No se encontro caso con id: ${caseFilter}`)
    console.error(`Casos disponibles: ${GOLD_STANDARD.map(c => c.id).join(', ')}`)
    process.exit(1)
  }

  const results = []

  for (const goldCase of cases) {
    console.log(`\nEvaluando: ${goldCase.name} (${goldCase.id})...`)

    let output: AnamnesisExtractionResult
    if (useMock) {
      const mock = MOCK_OUTPUTS[goldCase.id]
      if (!mock) {
        console.warn(`  SKIP: no hay mock output para ${goldCase.id}`)
        continue
      }
      output = mock
    } else {
      try {
        output = await callGemini(systemPrompt, responseSchema, goldCase)
      } catch (err) {
        console.error(`  ERROR: ${err instanceof Error ? err.message : err}`)
        continue
      }
    }

    const result = evaluateCase(goldCase, output)
    results.push(result)
    console.log(`  Score: ${result.overallScore.toFixed(2)}`)

    for (const f of result.fields) {
      if (f.status === 'skipped') continue
      const icon = f.score >= 0.9 ? 'OK' : f.score >= 0.5 ? '~~' : 'XX'
      console.log(`    [${icon}] ${f.field}: ${f.score.toFixed(2)} (${f.status})`)
    }
    console.log(`    [${result.narrativeScore >= 0.8 ? 'OK' : result.narrativeScore >= 0.5 ? '~~' : 'XX'}] narrative: ${result.narrativeScore.toFixed(2)}`)
  }

  if (results.length === 0) {
    console.error('\nNo se evaluo ningun caso.')
    process.exit(1)
  }

  const previousSummary = await loadPreviousSummary()
  const summary = computeSummary(results, useMock ? 'mock' : GEMINI_MODEL, promptVersion)
  const report = generateMarkdownReport(summary, previousSummary)

  // Guardar reporte y JSON
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const mdPath = `${import.meta.dir}/results/eval-${ts}.md`
  const jsonPath = `${import.meta.dir}/results/eval-${ts}.json`

  await Bun.write(mdPath, report)
  await Bun.write(jsonPath, JSON.stringify(summary, null, 2))

  console.log(`\n=== RESUMEN ===`)
  console.log(`Overall:                  ${summary.overall.toFixed(2)}`)
  console.log(`Safety Flags Recall:      ${summary.safetyFlagsRecall.toFixed(2)}`)
  console.log(`Chief Complaint Accuracy: ${summary.chiefComplaintAccuracy.toFixed(2)}`)
  console.log(`Medication Families F1:   ${summary.medicationFamiliesF1.toFixed(2)}`)
  console.log(`\nReporte: ${mdPath}`)
  console.log(`JSON:    ${jsonPath}`)

  if (previousSummary) {
    const diff = summary.overall - previousSummary.overall
    console.log(`\nDelta vs anterior: ${diff >= 0 ? '+' : ''}${diff.toFixed(3)}`)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
