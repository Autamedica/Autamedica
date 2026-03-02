/**
 * Servicio Unificado de AI
 * Decide automáticamente qué proveedor usar (Anthropic Claude o Google Gemini)
 * basado en feature flags y disponibilidad
 */

import { getAIProvider, logger } from '@autamedica/shared';
import { getAIAnalysisService, AIAnalysisService } from './ai-analysis-service';
import { getGeminiAIService, GeminiAIService } from './gemini-ai-service';
import type { MedicalAnalysis, AnalysisRequest } from './ai-analysis-service';

/**
 * Servicio Unificado que abstrae el proveedor de AI
 */
export class UnifiedAIService {
  private anthropicService: AIAnalysisService;
  private geminiService: GeminiAIService;
  private currentProvider: 'anthropic' | 'google' | null;

  constructor() {
    this.anthropicService = getAIAnalysisService();
    this.geminiService = getGeminiAIService();
    this.currentProvider = getAIProvider();

    if (this.currentProvider) {
      logger.info(`UnifiedAIService usando: ${this.currentProvider.toUpperCase()}`);
    } else {
      logger.info('UnifiedAIService en modo MOCK');
    }
  }

  /**
   * Analizar datos médicos con el proveedor disponible
   */
  async analyzeMedicalData(
    request: AnalysisRequest
  ): Promise<MedicalAnalysis> {
    const provider = this.currentProvider || getAIProvider();

    switch (provider) {
      case 'anthropic':
        logger.info('Usando Anthropic Claude para analisis');
        return this.anthropicService.analyzeMedicalData(request);

      case 'google':
        logger.info('Usando Google Gemini para analisis');
        return this.geminiService.analyzeMedicalData(request);

      default:
        // Modo mock - intentar con cualquier servicio disponible
        logger.info('Modo mock - usando fallback');
        return this.anthropicService.analyzeMedicalData(request);
    }
  }

  /**
   * Análisis con imágenes (solo Gemini lo soporta nativamente)
   */
  async analyzeWithImage(
    request: AnalysisRequest,
    imageBase64: string,
    imageMimeType: string = 'image/jpeg'
  ): Promise<MedicalAnalysis> {
    const provider = this.currentProvider || getAIProvider();

    if (provider === 'google') {
      logger.info('Analisis multimodal con Google Gemini');
      return this.geminiService.analyzeWithImage(
        request,
        imageBase64,
        imageMimeType
      );
    }

    // Anthropic también soporta imágenes, pero de forma diferente
    if (provider === 'anthropic') {
      logger.warn(
        'Anthropic soporta imagenes pero requiere implementacion especial'
      );
      // TODO(blocked): [AI] Anthropic Vision API requiere conversión de payload a content blocks con image_url ticket:BACKLOG
      return this.anthropicService.analyzeMedicalData(request);
    }

    // Fallback sin imagen
    logger.warn('No hay proveedor de AI con soporte de imagenes disponible');
    return this.analyzeMedicalData(request);
  }

  /**
   * Cambiar proveedor manualmente
   */
  switchProvider(provider: 'anthropic' | 'google'): boolean {
    const geminiInfo = this.geminiService.getServiceInfo();
    const anthropicInfo = this.anthropicService.getServiceInfo();

    if (provider === 'google' && !geminiInfo.apiKeyConfigured) {
      logger.error('No se puede cambiar a Google: API key no configurada');
      return false;
    }

    if (provider === 'anthropic' && !anthropicInfo.apiKeyConfigured) {
      logger.error('No se puede cambiar a Anthropic: API key no configurada');
      return false;
    }

    this.currentProvider = provider;
    logger.info(`Proveedor de AI cambiado a: ${provider.toUpperCase()}`);
    return true;
  }

  /**
   * Obtener información de ambos proveedores
   */
  getProvidersInfo() {
    const anthropicInfo = this.anthropicService.getServiceInfo();
    const geminiInfo = this.geminiService.getServiceInfo();

    return {
      current: this.currentProvider,
      providers: {
        anthropic: {
          available: anthropicInfo.apiKeyConfigured,
          mode: anthropicInfo.mode,
          model: anthropicInfo.modelUsed,
        },
        google: {
          available: geminiInfo.apiKeyConfigured,
          mode: geminiInfo.mode,
          model: geminiInfo.modelUsed,
          features: geminiInfo.features,
        },
      },
    };
  }

  /**
   * Verificar disponibilidad de features
   */
  hasFeature(feature: 'multimodal' | 'vision' | 'longContext' | 'thinking'): boolean {
    const provider = this.currentProvider || getAIProvider();

    if (provider === 'google') {
      const geminiInfo = this.geminiService.getServiceInfo();
      return geminiInfo.features?.[feature] || false;
    }

    if (provider === 'anthropic') {
      // Anthropic tiene diferentes capabilities
      if (feature === 'multimodal' || feature === 'vision') return true;
      if (feature === 'longContext') return true; // 200K tokens
      if (feature === 'thinking') return false; // No tiene modo thinking
    }

    return false;
  }

  /**
   * Análisis comparativo con ambos proveedores
   * Útil para validación cruzada
   */
  async compareAnalysis(
    request: AnalysisRequest
  ): Promise<{
    anthropic: MedicalAnalysis | null;
    google: MedicalAnalysis | null;
    comparison: {
      agreement: number; // 0-100%
      differences: string[];
    };
  }> {
    const anthropicInfo = this.anthropicService.getServiceInfo();
    const geminiInfo = this.geminiService.getServiceInfo();

    const results = {
      anthropic: null as MedicalAnalysis | null,
      google: null as MedicalAnalysis | null,
      comparison: {
        agreement: 0,
        differences: [] as string[],
      },
    };

    // Ejecutar análisis en paralelo si ambos están disponibles
    const promises: Promise<void>[] = [];

    if (anthropicInfo.apiKeyConfigured) {
      promises.push(
        this.anthropicService
          .analyzeMedicalData(request)
          .then((analysis) => {
            results.anthropic = analysis;
          })
          .catch((error) => {
            logger.error('Error en analisis con Anthropic:', error);
          })
      );
    }

    if (geminiInfo.apiKeyConfigured) {
      promises.push(
        this.geminiService
          .analyzeMedicalData(request)
          .then((analysis) => {
            results.google = analysis;
          })
          .catch((error) => {
            logger.error('Error en analisis con Gemini:', error);
          })
      );
    }

    await Promise.all(promises);

    // Comparar resultados
    if (results.anthropic && results.google) {
      results.comparison = this.compareResults(
        results.anthropic,
        results.google
      );
    }

    return results;
  }

  /**
   * Comparar dos análisis
   */
  private compareResults(
    analysis1: MedicalAnalysis,
    analysis2: MedicalAnalysis
  ): { agreement: number; differences: string[] } {
    const differences: string[] = [];

    // Comparar severidad
    if (analysis1.severity !== analysis2.severity) {
      differences.push(
        `Severidad diferente: ${analysis1.severity} vs ${analysis2.severity}`
      );
    }

    // Comparar confianza
    const confidenceDiff = Math.abs(analysis1.confidence - analysis2.confidence);
    if (confidenceDiff > 20) {
      differences.push(
        `Gran diferencia en confianza: ${analysis1.confidence}% vs ${analysis2.confidence}%`
      );
    }

    // Comparar recomendaciones (simplificado)
    if (analysis1.recommendations.length !== analysis2.recommendations.length) {
      differences.push(
        `Diferente número de recomendaciones: ${analysis1.recommendations.length} vs ${analysis2.recommendations.length}`
      );
    }

    // Calcular agreement básico
    let agreement = 100;
    agreement -= differences.length * 15; // -15% por cada diferencia
    agreement = Math.max(0, Math.min(100, agreement));

    return { agreement, differences };
  }
}

// Singleton instance
let unifiedAIServiceInstance: UnifiedAIService | null = null;

/**
 * Obtener instancia única del servicio unificado
 */
export function getUnifiedAIService(): UnifiedAIService {
  if (!unifiedAIServiceInstance) {
    unifiedAIServiceInstance = new UnifiedAIService();
  }
  return unifiedAIServiceInstance;
}

// Export default para uso fácil
export default getUnifiedAIService;
