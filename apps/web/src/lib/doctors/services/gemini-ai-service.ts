/* eslint-disable */
// @ts-nocheck
import { getServerEnvOrDefault, logger, featureFlags } from '@autamedica/shared';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import type { AnalysisRequest, MedicalAnalysis } from './ai-analysis-service';

export class GeminiAIService {
  private genAI: GoogleGenerativeAI | null = null;
  private readonly model = 'gemini-2.5-flash-preview-05-20'; // Más rápido y económico
  // private readonly model = 'gemini-2.5-pro-preview-03-25'; // Más potente

  constructor() {
    const googleApiKey = getServerEnvOrDefault('GOOGLE_AI_API_KEY', '');
    if (!featureFlags.USE_MOCK_AI && googleApiKey) {
      this.genAI = new GoogleGenerativeAI(googleApiKey);
      logger.info('GeminiAIService inicializado con Gemini 2.5');
    } else if (featureFlags.USE_MOCK_AI) {
      logger.info('GeminiAIService en modo MOCK (desarrollo)');
    } else {
      logger.warn('GeminiAIService: No API key found');
    }
  }

  async analyzeMedicalData(
    request: AnalysisRequest
  ): Promise<MedicalAnalysis> {
    if (featureFlags.USE_MOCK_AI || !this.genAI) {
      return this.getMockAnalysis(request);
    }

    return this.getRealAnalysis(request);
  }

  private async getRealAnalysis(
    request: AnalysisRequest
  ): Promise<MedicalAnalysis> {
    if (!this.genAI) {
      throw new Error('Gemini AI client not initialized');
    }

    const model = this.genAI.getGenerativeModel({ model: this.model });
    const prompt = this.buildMedicalPrompt(request);

    try {
      const startTime = Date.now();

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3, // Baja temperatura para consistencia
          maxOutputTokens: 4096,
          topP: 0.95,
          topK: 40,
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      });

      const response = result.response;
      const text = response.text();
      const processingTime = Date.now() - startTime;

      const analysis = this.parseGeminiResponse(text);

      return {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...analysis,
        metadata: {
          modelUsed: this.model,
          tokensUsed: {
            input: response.usageMetadata?.promptTokenCount || 0,
            output: response.usageMetadata?.candidatesTokenCount || 0,
          },
        },
      };
    } catch (error) {
      logger.error('Error al analizar con Gemini:', error);

      // Fallback a mock
      logger.warn('Usando analisis mock como fallback');
      return this.getMockAnalysis(request);
    }
  }

  private buildMedicalPrompt(request: AnalysisRequest): string {
    const { data, context } = request;

    let prompt = `Eres un asistente médico especializado certificado.
Tu función es analizar datos médicos y proporcionar análisis clínicos preliminares.

IMPORTANTE:
- NO diagnostiques condiciones específicas
- Proporciona análisis basado en evidencia
- Recomienda seguimiento médico apropiado
- Usa lenguaje médico preciso pero comprensible
- Indica nivel de severidad y confianza

DATOS DEL PACIENTE:
`;

    // Síntomas
    if (data.symptoms && data.symptoms.length > 0) {
      prompt += `\nSÍNTOMAS REPORTADOS:\n`;
      data.symptoms.forEach((symptom, i) => {
        prompt += `${i + 1}. ${symptom}\n`;
      });
    }

    // Signos vitales
    if (data.vitals && Object.keys(data.vitals).length > 0) {
      prompt += `\nSIGNOS VITALES:\n`;
      Object.entries(data.vitals).forEach(([key, value]) => {
        prompt += `- ${key}: ${value}\n`;
      });
    }

    // Resultados de laboratorio
    if (data.labResults && data.labResults.length > 0) {
      prompt += `\nRESULTADOS DE LABORATORIO:\n`;
      data.labResults.forEach((result, i) => {
        prompt += `${i + 1}. ${JSON.stringify(result)}\n`;
      });
    }

    // Historial médico
    if (data.medicalHistory) {
      prompt += `\nHISTORIAL MÉDICO:\n${data.medicalHistory}\n`;
    }

    // Medicaciones actuales
    if (data.currentMedications && data.currentMedications.length > 0) {
      prompt += `\nMEDICACIONES ACTUALES:\n`;
      data.currentMedications.forEach((med, i) => {
        prompt += `${i + 1}. ${med}\n`;
      });
    }

    // Contexto adicional
    if (context) {
      prompt += `\nCONTEXTO ADICIONAL:\n${context}\n`;
    }

    prompt += `\nProporciona un análisis médico en formato JSON con la siguiente estructura:
{
  "summary": "Resumen conciso del análisis",
  "recommendations": ["Recomendación 1", "Recomendación 2", ...],
  "severity": "low|medium|high|critical",
  "confidence": 0-100,
  "keyFindings": ["Hallazgo 1", "Hallazgo 2", ...]
}

SOLO responde con el JSON, sin texto adicional.`;

    return prompt;
  }

  private parseGeminiResponse(responseText: string): Partial<MedicalAnalysis> {
    try {
      // Intentar extraer JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        return {
          summary: parsed.summary || 'Análisis completado',
          recommendations: parsed.recommendations || [],
          severity: parsed.severity || 'low',
          confidence: parsed.confidence || 70,
        };
      }

      // Si no hay JSON válido, usar texto directo
      return {
        summary: responseText.substring(0, 500),
        recommendations: ['Revisar análisis detallado'],
        severity: 'medium',
        confidence: 60,
      };
    } catch (error) {
      logger.error('Error parseando respuesta de Gemini:', error);

      return {
        summary: 'Error parseando análisis',
        recommendations: ['Revisar manualmente los datos'],
        severity: 'low',
        confidence: 0,
      };
    }
  }

  private getMockAnalysis(_request: AnalysisRequest): MedicalAnalysis {
    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      summary: 'Servicio de IA no disponible. Configure GOOGLE_AI_API_KEY para habilitar análisis real.',
      recommendations: [],
      severity: 'low',
      confidence: 0,
      metadata: {
        modelUsed: 'none',
      },
    };
  }

  isProductionMode(): boolean {
    return !featureFlags.USE_MOCK_AI && this.genAI !== null;
  }

  getServiceInfo() {
    return {
      provider: 'Google Gemini',
      mode: featureFlags.USE_MOCK_AI ? 'mock' : 'production',
      modelUsed: featureFlags.USE_MOCK_AI ? 'gemini-mock' : this.model,
      apiKeyConfigured: !!getServerEnvOrDefault('GOOGLE_AI_API_KEY', ''),
      clientInitialized: !!this.genAI,
      features: {
        multimodal: true,
        vision: true,
        longContext: true, // 1M tokens
        thinking: true, // Gemini 2.5 Pro tiene modo thinking
      },
    };
  }

  async analyzeWithImage(
    request: AnalysisRequest,
    imageBase64: string,
    imageMimeType: string = 'image/jpeg'
  ): Promise<MedicalAnalysis> {
    if (!this.genAI || featureFlags.USE_MOCK_AI) {
      return this.getMockAnalysis(request);
    }

    const model = this.genAI.getGenerativeModel({ model: this.model });
    const prompt = this.buildMedicalPrompt(request);

    try {
      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: imageMimeType,
                  data: imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      });

      const response = result.response;
      const text = response.text();
      const analysis = this.parseGeminiResponse(text);

      return {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...analysis,
        metadata: {
          modelUsed: this.model,
          tokensUsed: {
            input: response.usageMetadata?.promptTokenCount || 0,
            output: response.usageMetadata?.candidatesTokenCount || 0,
          },
        },
      };
    } catch (error) {
      logger.error('Error en analisis multimodal con Gemini:', error);
      return this.getMockAnalysis(request);
    }
  }
}

let geminiServiceInstance: GeminiAIService | null = null;

export function getGeminiAIService(): GeminiAIService {
  if (!geminiServiceInstance) {
    geminiServiceInstance = new GeminiAIService();
  }
  return geminiServiceInstance;
}
