import { getServerEnvOrDefault, featureFlags, logger } from '@autamedica/shared';

// Anthropic SDK types - loaded dynamically to avoid hard dependency
interface AnthropicMessage {
  content: Array<{ type: string; text: string }>;
  usage: { input_tokens: number; output_tokens: number };
}

interface AnthropicClient {
  messages: {
    create(_params: Record<string, unknown>): Promise<AnthropicMessage>;
  };
}

/**
 * Tipos para el servicio de AI
 */
export interface MedicalAnalysis {
  id: string;
  timestamp: string;
  summary: string;
  recommendations: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence: number; // 0-100
  metadata?: {
    modelUsed?: string;
    tokensUsed?: {
      input: number;
      output: number;
    };
  };
}

export interface AnalysisRequest {
  patientId: string;
  data: {
    symptoms?: string[];
    vitals?: Record<string, unknown>;
    labResults?: unknown[];
    medicalHistory?: string;
    currentMedications?: string[];
  };
  context?: string;
}

/**
 * Servicio de Análisis Médico con IA
 * Usa Claude (Anthropic) en producción, mocks en desarrollo
 */
export class AIAnalysisService {
  private anthropic: AnthropicClient | null = null;
  private readonly model = 'claude-sonnet-4-5-20250929';

  constructor() {
    // Solo inicializar Anthropic si NO estamos en modo mock
    // y tenemos API key disponible
    const anthropicKey = getServerEnvOrDefault('ANTHROPIC_API_KEY', '');
    if (!featureFlags.USE_MOCK_AI && anthropicKey) {
      try {
        // Dynamic require to avoid hard dependency on @anthropic-ai/sdk
         
        const Anthropic = require('@anthropic-ai/sdk').default;
        this.anthropic = new Anthropic({
          apiKey: anthropicKey,
        }) as AnthropicClient;

        logger.info('AIAnalysisService inicializado con Claude API');
      } catch {
        logger.warn(
          'AIAnalysisService: @anthropic-ai/sdk not installed, usando modo mock'
        );
      }
    } else if (featureFlags.USE_MOCK_AI) {
      logger.info('AIAnalysisService en modo MOCK (desarrollo)');
    } else {
      logger.warn(
        'AIAnalysisService: No API key found, usando modo mock'
      );
    }
  }

  /**
   * Analizar datos médicos con IA
   */
  async analyzeMedicalData(
    request: AnalysisRequest
  ): Promise<MedicalAnalysis> {
    // Modo mock para desarrollo
    if (featureFlags.USE_MOCK_AI || !this.anthropic) {
      return this.getMockAnalysis(request);
    }

    // Modo producción con Claude
    return this.getRealAnalysis(request);
  }

  /**
   * Análisis mock para desarrollo
   */
  private getMockAnalysis(request: AnalysisRequest): MedicalAnalysis {
    const { symptoms = [], vitals = {} } = request.data;
    const vitalsCount = Object.keys(vitals).length;

    return {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      summary: `[MOCK] Análisis simulado de ${symptoms.length} síntomas reportados. ${vitalsCount} signos vitales registrados.`,
      recommendations: [
        'Monitorear evolución en las próximas 24-48 horas',
        'Mantener hidratación adecuada',
        'Seguimiento en 1 semana si persisten síntomas',
        '[MOCK DATA - Usar Claude API real en producción]',
      ],
      severity: this.calculateMockSeverity(symptoms.length),
      confidence: 75,
      metadata: {
        modelUsed: 'mock-model-dev',
      },
    };
  }

  /**
   * Análisis real con Claude
   */
  private async getRealAnalysis(
    request: AnalysisRequest
  ): Promise<MedicalAnalysis> {
    if (!this.anthropic) {
      throw new Error('Anthropic client not initialized');
    }

    const prompt = this.buildMedicalPrompt(request);

    try {
      const message = await this.anthropic.messages.create({
        model: this.model,
        max_tokens: 4096,
        temperature: 0.3, // Baja temperatura para respuestas más consistentes
        system: `Eres un asistente médico especializado certificado.
Tu función es analizar datos médicos y proporcionar análisis clínicos preliminares.

IMPORTANTE:
- NO diagnostiques condiciones específicas
- Proporciona análisis basado en evidencia
- Recomienda seguimiento médico apropiado
- Usa lenguaje médico preciso pero comprensible
- Indica nivel de severidad y confianza

FORMATO DE RESPUESTA (JSON):
{
  "summary": "Resumen conciso del análisis",
  "recommendations": ["Recomendación 1", "Recomendación 2", ...],
  "severity": "low|medium|high|critical",
  "confidence": 0-100,
  "keyFindings": ["Hallazgo 1", "Hallazgo 2", ...]
}`,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extraer respuesta
      const firstContent = message.content[0];
      const responseText =
        firstContent?.type === 'text' ? firstContent.text : '';

      // Parsear JSON de la respuesta
      const analysis = this.parseClaudeResponse(responseText);

      return {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...analysis,
        summary: analysis.summary || 'Análisis completado sin resumen específico',
        recommendations: analysis.recommendations || [],
        severity: analysis.severity || 'low',
        confidence: analysis.confidence || 0,
        metadata: {
          modelUsed: this.model,
          tokensUsed: {
            input: message.usage.input_tokens,
            output: message.usage.output_tokens,
          },
        },
      };
    } catch (error) {
      logger.error('Error al analizar con Claude:', error);

      // Fallback a mock si falla la API
      logger.warn('Usando analisis mock como fallback');
      return this.getMockAnalysis(request);
    }
  }

  /**
   * Construir prompt médico estructurado
   */
  private buildMedicalPrompt(request: AnalysisRequest): string {
    const { data, context } = request;

    let prompt = `Analiza los siguientes datos médicos del paciente:\n\n`;

    // Síntomas
    if (data.symptoms && data.symptoms.length > 0) {
      prompt += `SÍNTOMAS REPORTADOS:\n`;
      data.symptoms.forEach((symptom, i) => {
        prompt += `${i + 1}. ${symptom}\n`;
      });
      prompt += '\n';
    }

    // Signos vitales
    if (data.vitals && Object.keys(data.vitals).length > 0) {
      prompt += `SIGNOS VITALES:\n`;
      Object.entries(data.vitals).forEach(([key, value]) => {
        prompt += `- ${key}: ${value}\n`;
      });
      prompt += '\n';
    }

    // Resultados de laboratorio
    if (data.labResults && data.labResults.length > 0) {
      prompt += `RESULTADOS DE LABORATORIO:\n`;
      data.labResults.forEach((result, i) => {
        prompt += `${i + 1}. ${JSON.stringify(result)}\n`;
      });
      prompt += '\n';
    }

    // Historial médico
    if (data.medicalHistory) {
      prompt += `HISTORIAL MÉDICO:\n${data.medicalHistory}\n\n`;
    }

    // Medicaciones actuales
    if (data.currentMedications && data.currentMedications.length > 0) {
      prompt += `MEDICACIONES ACTUALES:\n`;
      data.currentMedications.forEach((med, i) => {
        prompt += `${i + 1}. ${med}\n`;
      });
      prompt += '\n';
    }

    // Contexto adicional
    if (context) {
      prompt += `CONTEXTO ADICIONAL:\n${context}\n\n`;
    }

    prompt += `\nProporciona un análisis médico en formato JSON siguiendo el schema especificado.`;

    return prompt;
  }

  /**
   * Parsear respuesta de Claude
   */
  private parseClaudeResponse(responseText: string): Partial<MedicalAnalysis> {
    try {
      // Intentar extraer JSON de la respuesta
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

      // Si no hay JSON, usar la respuesta directa
      return {
        summary: responseText.substring(0, 500),
        recommendations: ['Revisar análisis detallado'],
        severity: 'medium',
        confidence: 60,
      };
    } catch (error) {
      logger.error('Error parseando respuesta de Claude:', error);

      return {
        summary: 'Error parseando análisis',
        recommendations: ['Revisar manualmente los datos'],
        severity: 'low',
        confidence: 0,
      };
    }
  }

  /**
   * Calcular severidad mock basado en número de síntomas
   */
  private calculateMockSeverity(
    symptomCount: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (symptomCount === 0) return 'low';
    if (symptomCount <= 2) return 'low';
    if (symptomCount <= 4) return 'medium';
    if (symptomCount <= 6) return 'high';
    return 'critical';
  }

  /**
   * Verificar si el servicio está en modo producción
   */
  isProductionMode(): boolean {
    return !featureFlags.USE_MOCK_AI && this.anthropic !== null;
  }

  /**
   * Obtener información del servicio
   */
  getServiceInfo() {
    return {
      mode: featureFlags.USE_MOCK_AI ? 'mock' : 'production',
      modelUsed: featureFlags.USE_MOCK_AI ? 'mock-model' : this.model,
      apiKeyConfigured: !!getServerEnvOrDefault('ANTHROPIC_API_KEY', ''),
      clientInitialized: !!this.anthropic,
    };
  }
}

// Singleton instance
let aiServiceInstance: AIAnalysisService | null = null;

/**
 * Obtener instancia única del servicio
 */
export function getAIAnalysisService(): AIAnalysisService {
  if (!aiServiceInstance) {
    aiServiceInstance = new AIAnalysisService();
  }
  return aiServiceInstance;
}
