/**
 * Servicio de generación de reportes clínicos SOAP post-consulta
 *
 * Cruza transcripción + anamnesis + notas del doctor para generar
 * un informe estructurado formato SOAP via AI.
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { getServerEnvOrDefault, getAIProvider, logger, featureFlags } from '@autamedica/shared';
import type { GenerateReportRequest, GenerateReportResponse, SOAPReport } from '@autamedica/types';

const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const GEMINI_MODEL = 'gemini-2.5-flash-preview-05-20';

const SYSTEM_PROMPT = `Eres un asistente de documentación médica especializado en generar notas clínicas estructuradas formato SOAP (Subjetivo, Objetivo, Evaluación, Plan).

CONTEXTO: Recibirás la transcripción de una consulta médica por videollamada, posiblemente con datos de anamnesis previa del paciente y notas del doctor.

INSTRUCCIONES:
- Genera un reporte SOAP profesional basado en la evidencia disponible
- Usa lenguaje médico preciso pero comprensible
- No inventes información que no esté en los datos proporcionados
- Si una sección no tiene datos suficientes, indicalo con "Sin datos suficientes para esta sección"
- Sé conciso pero completo
- Incluye diagnósticos diferenciales cuando haya evidencia
- Las recomendaciones de seguimiento deben ser específicas y accionables

FORMATO DE RESPUESTA (JSON estricto, sin markdown):
{
  "subjective": "Motivo de consulta y relato del paciente. Incluir: motivo principal, enfermedad actual, síntomas referidos, antecedentes relevantes mencionados durante la consulta.",
  "objective": "Hallazgos objetivos mencionados durante la consulta: signos vitales discutidos, hallazgos del examen físico referidos, resultados de estudios mencionados.",
  "assessment": "Impresión clínica del médico basada en la consulta. Integrar datos subjetivos y objetivos.",
  "plan": "Plan terapéutico: medicación indicada, estudios solicitados, derivaciones, pautas de alarma, seguimiento.",
  "chiefComplaint": "Motivo de consulta principal en una oración, o null si no se identifica",
  "differentialDiagnosis": ["Diagnóstico diferencial 1", "Diagnóstico diferencial 2"],
  "followUpRecommendations": ["Recomendación de seguimiento 1", "Recomendación 2"],
  "confidence": 75
}`;

function buildPrompt(request: GenerateReportRequest): string {
  const parts: string[] = [];

  // Patient demographics
  const demographics = [request.patientName];
  if (request.patientAge) demographics.push(`${request.patientAge} años`);
  if (request.patientGender) {
    const genderLabel = request.patientGender === 'male' ? 'Masculino' : request.patientGender === 'female' ? 'Femenino' : request.patientGender;
    demographics.push(genderLabel);
  }
  parts.push(`PACIENTE: ${demographics.join(' · ')}`);

  // Anamnesis data
  if (request.anamnesisSummary) {
    parts.push(`\nANAMNESIS PREVIA DEL PACIENTE:\n${request.anamnesisSummary}`);
  }

  if (request.anamnesisExtraction) {
    const ext = request.anamnesisExtraction;
    const extractionParts: string[] = [];

    if (ext.chiefComplaint) {
      const cc = ext.chiefComplaint as { normalizedMedicalText?: string; rawText?: string };
      extractionParts.push(`Motivo de consulta: ${cc.normalizedMedicalText ?? cc.rawText ?? 'No especificado'}`);
    }
    if (ext.presentIllness) {
      const pi = ext.presentIllness as { clinicalNarrative?: string; associatedSymptoms?: string[] };
      if (pi.clinicalNarrative) extractionParts.push(`Enfermedad actual: ${pi.clinicalNarrative}`);
      if (pi.associatedSymptoms?.length) extractionParts.push(`Síntomas asociados: ${pi.associatedSymptoms.join(', ')}`);
    }
    if (ext.safetyFlags) {
      const flags = ext.safetyFlags as string[];
      if (flags.length > 0) extractionParts.push(`Alertas de seguridad: ${flags.join('; ')}`);
    }

    if (extractionParts.length > 0) {
      parts.push(`\nEXTRACCIÓN AI DE ANAMNESIS:\n${extractionParts.join('\n')}`);
    }
  }

  // Transcription
  parts.push(`\nTRANSCRIPCIÓN DE LA CONSULTA:\n${request.transcriptionText}`);

  // Doctor notes
  if (request.doctorNotes) {
    parts.push(`\nNOTAS DEL DOCTOR:\n${request.doctorNotes}`);
  }

  parts.push('\nGenera el reporte SOAP en formato JSON.');

  return parts.join('\n');
}

function parseJsonResponse(text: string): Record<string, unknown> {
  // Try direct parse
  try {
    return JSON.parse(text);
  } catch {
    // Extract JSON from markdown code blocks
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1].trim());
    }
    // Try finding JSON object in text
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      return JSON.parse(braceMatch[0]);
    }
    throw new Error('No se pudo parsear la respuesta JSON del modelo AI');
  }
}

function toReportResponse(parsed: Record<string, unknown>, provider: string, model: string): GenerateReportResponse {
  return {
    report: {
      subjective: (parsed.subjective as string) || 'Sin datos suficientes',
      objective: (parsed.objective as string) || 'Sin datos suficientes',
      assessment: (parsed.assessment as string) || 'Sin datos suficientes',
      plan: (parsed.plan as string) || 'Sin datos suficientes',
    },
    chiefComplaint: (parsed.chiefComplaint as string) ?? null,
    differentialDiagnosis: (parsed.differentialDiagnosis as string[]) ?? [],
    followUpRecommendations: (parsed.followUpRecommendations as string[]) ?? [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 50,
    provider,
    model,
  };
}

async function generateWithAnthropic(prompt: string): Promise<GenerateReportResponse> {
  const apiKey = getServerEnvOrDefault('ANTHROPIC_API_KEY', '');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY no configurada');

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const firstContent = message.content[0];
  const responseText = firstContent?.type === 'text' ? firstContent.text : '';
  const parsed = parseJsonResponse(responseText);

  return toReportResponse(parsed, 'anthropic', ANTHROPIC_MODEL);
}

async function generateWithGemini(prompt: string): Promise<GenerateReportResponse> {
  const apiKey = getServerEnvOrDefault('GOOGLE_AI_API_KEY', '');
  if (!apiKey) throw new Error('GOOGLE_AI_API_KEY no configurada');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `${SYSTEM_PROMPT}\n\n${prompt}` }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      topP: 0.95,
    },
    safetySettings: [
      { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    ],
  });

  const responseText = result.response.text();
  const parsed = parseJsonResponse(responseText);

  return toReportResponse(parsed, 'google', GEMINI_MODEL);
}

function getMockReport(request: GenerateReportRequest): GenerateReportResponse {
  const report: SOAPReport = {
    subjective: `Paciente ${request.patientName} consulta por videollamada. ${request.transcriptionText.length > 200 ? request.transcriptionText.slice(0, 200) + '...' : request.transcriptionText}`,
    objective: 'Consulta por videollamada. Examen físico no realizable de forma remota.',
    assessment: 'Evaluación clínica basada en datos de anamnesis y transcripción de consulta. Reporte generado en modo desarrollo.',
    plan: 'Seguimiento según evolución clínica. Control en 7-14 días.',
  };

  return {
    report,
    chiefComplaint: null,
    differentialDiagnosis: [],
    followUpRecommendations: ['Control en 7-14 días'],
    confidence: 0,
    provider: 'mock',
    model: 'mock',
  };
}

export async function generateConsultationReport(
  request: GenerateReportRequest,
): Promise<GenerateReportResponse> {
  if (featureFlags.USE_MOCK_AI) {
    logger.info('[consultation-report] Modo mock');
    return getMockReport(request);
  }

  const prompt = buildPrompt(request);
  const provider = getAIProvider();

  try {
    if (provider === 'anthropic') {
      logger.info('[consultation-report] Generando con Anthropic Claude');
      return await generateWithAnthropic(prompt);
    }

    if (provider === 'google') {
      logger.info('[consultation-report] Generando con Google Gemini');
      return await generateWithGemini(prompt);
    }

    // No provider configured — try Gemini first (cheaper), fallback to Anthropic
    try {
      return await generateWithGemini(prompt);
    } catch {
      return await generateWithAnthropic(prompt);
    }
  } catch (error) {
    logger.error('[consultation-report] AI generation failed, returning mock', error);
    return getMockReport(request);
  }
}
