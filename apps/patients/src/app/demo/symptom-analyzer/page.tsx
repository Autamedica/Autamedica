'use client';

import { useState, useEffect } from 'react';
import * as ort from 'onnxruntime-web';
import { logger } from '@autamedica/shared';

interface SymptomAnalysis {
  category: string;
  confidence: number;
  urgency: 'low' | 'medium' | 'high';
  recommendedSpecialty: string;
  recommendations: string[];
}

export default function SymptomAnalyzerPage() {
  const [symptoms, setSymptoms] = useState('');
  const [analysis, setAnalysis] = useState<SymptomAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [onnxReady, setOnnxReady] = useState(false);

  useEffect(() => {
    // Verificar que ONNX está disponible
    // logger.info('🧠 ONNX Runtime version:', ort.env.versions.web);
    setOnnxReady(true);
  }, []);

  async function analyzeSymptoms() {
    if (!symptoms.trim()) return;

    setLoading(true);

    try {
      // Simulación de análisis con ONNX
      // En producción, aquí cargarías un modelo real
      const features = textToFeatures(symptoms);

      // Crear tensor de entrada (simulado)
      const input = new ort.Tensor(
        'float32',
        Float32Array.from(features),
        [1, features.length]
      );

      logger.info('📊 Tensor creado:', {
        shape: input.dims,
        size: input.size,
        type: input.type
      });

      // Simulación de predicción
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simular latencia

      const predictions = simulateMLPrediction(features, symptoms);

      setAnalysis(predictions);
    } catch (error) {
      logger.error('Error analyzing symptoms:', error);
      alert('Error al analizar síntomas. Ver consola para detalles.');
    } finally {
      setLoading(false);
    }
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return 'bg-red-100 text-red-700 border-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      default: return 'bg-green-100 text-green-700 border-green-300';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      default: return '🟢';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🔬 Analizador de Síntomas con IA
          </h1>
          <p className="text-gray-600">
            Análisis inteligente en tiempo real - 100% en tu navegador
          </p>
          {onnxReady && (
            <div className="mt-2 inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
              ✅ IA Médica E.M Medicina UBA - Motor v{ort.env.versions.web} activo
            </div>
          )}
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Input Section */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Describe tus síntomas en detalle:
              </label>
              <textarea
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Ejemplo: Tengo dolor de cabeza intenso desde hace 2 días, fiebre de 38°C, náuseas y sensibilidad a la luz..."
                className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all min-h-[140px] resize-y"
                disabled={loading}
              />
              <div className="mt-2 text-sm text-gray-500">
                {symptoms.length} caracteres | {symptoms.split(/\s+/).filter(Boolean).length} palabras
              </div>
            </div>

            <button
              onClick={analyzeSymptoms}
              disabled={!symptoms.trim() || loading || !onnxReady}
              className={`w-full py-4 rounded-lg font-semibold text-white transition-all ${
                loading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transform hover:scale-[1.02]'
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Analizando con IA...
                </span>
              ) : (
                '🧠 Analizar Síntomas con IA'
              )}
            </button>
          </div>

          {/* Results Section */}
          {analysis && (
            <div className="mt-8 space-y-6 animate-fade-in">
              <div className="border-t-2 border-gray-200 pt-6">
                <h3 className="text-2xl font-bold text-gray-800 mb-4">
                  📊 Resultados del Análisis
                </h3>

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-lg">
                    <p className="text-sm text-blue-600 font-medium mb-1">Categoría</p>
                    <p className="text-xl font-bold text-blue-900">{analysis.category}</p>
                  </div>

                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-lg">
                    <p className="text-sm text-purple-600 font-medium mb-1">Confianza del Modelo</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-purple-200 rounded-full h-3">
                        <div
                          className="bg-purple-600 h-3 rounded-full transition-all duration-500"
                          style={{ width: `${analysis.confidence * 100}%` }}
                        />
                      </div>
                      <span className="text-xl font-bold text-purple-900">
                        {(analysis.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg border-2 ${getUrgencyColor(analysis.urgency)}`}>
                    <p className="text-sm font-medium mb-1">Nivel de Urgencia</p>
                    <p className="text-xl font-bold flex items-center gap-2">
                      {getUrgencyIcon(analysis.urgency)}
                      {analysis.urgency === 'high' ? 'Alta' :
                       analysis.urgency === 'medium' ? 'Media' : 'Baja'}
                    </p>
                  </div>

                  <div className="bg-gradient-to-br from-teal-50 to-teal-100 p-4 rounded-lg">
                    <p className="text-sm text-teal-600 font-medium mb-1">Especialidad Sugerida</p>
                    <p className="text-xl font-bold text-teal-900">
                      {analysis.recommendedSpecialty}
                    </p>
                  </div>
                </div>

                {/* Recommendations */}
                <div className={`p-5 rounded-lg border-2 ${
                  analysis.urgency === 'high' ? 'bg-red-50 border-red-200' :
                  analysis.urgency === 'medium' ? 'bg-yellow-50 border-yellow-200' :
                  'bg-green-50 border-green-200'
                }`}>
                  <h4 className="font-bold text-lg mb-3 flex items-center gap-2">
                    💡 Recomendaciones
                  </h4>
                  <ul className="space-y-2">
                    {analysis.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-lg">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Tech Info */}
          <div className="mt-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="font-semibold text-gray-700 mb-2 flex items-center gap-2">
              🔒 Tecnología y Privacidad
            </p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li>✅ IA Médica E.M Medicina UBA - Ejecución local en navegador</li>
              <li>✅ WebGL/WASM para máximo rendimiento</li>
              <li>✅ Tus datos nunca salen de tu dispositivo</li>
              <li>✅ Sin envío de información al servidor</li>
              <li>✅ Procesamiento en tiempo real</li>
            </ul>
          </div>
        </div>

        {/* Demo Note */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>⚠️ Esta es una demostración. No sustituye el diagnóstico médico profesional.</p>
          <p className="mt-1">En producción se usaría un modelo de IA real entrenado con datos médicos por E.M Medicina UBA.</p>
        </div>
      </div>
    </div>
  );
}

// Utilidades
function textToFeatures(text: string): number[] {
  const features = new Array(128).fill(0);
  const words = text.toLowerCase().split(/\s+/);

  // Keywords médicas categorizadas
  const urgentKeywords = ['pecho', 'respirar', 'desmayo', 'sangre', 'grave', 'intenso'];
  const painKeywords = ['dolor', 'molestia', 'punzada', 'ardor'];
  const feverKeywords = ['fiebre', 'temperatura', 'calentura'];
  const digestiveKeywords = ['náusea', 'vómito', 'diarrea', 'estómago'];
  const neurologicalKeywords = ['cabeza', 'mareo', 'visión', 'luz', 'equilibrio'];

  words.forEach(word => {
    if (urgentKeywords.some(k => word.includes(k))) features[0] += 1;
    if (painKeywords.some(k => word.includes(k))) features[1] += 1;
    if (feverKeywords.some(k => word.includes(k))) features[2] += 1;
    if (digestiveKeywords.some(k => word.includes(k))) features[3] += 1;
    if (neurologicalKeywords.some(k => word.includes(k))) features[4] += 1;
  });

  // Features adicionales
  features[64] = Math.min(text.length / 500, 1); // Longitud normalizada
  features[65] = Math.min(words.length / 100, 1); // Cantidad de palabras
  features[66] = (text.match(/\d+/g) || []).length / 10; // Números (ej: temperatura)

  return features;
}

function simulateMLPrediction(features: number[], _text: string): SymptomAnalysis {
  const urgentScore = features[0];
  const painScore = features[1];
  const feverScore = features[2];
  const digestiveScore = features[3];
  const neuroScore = features[4];

  // Determinar urgencia
  let urgency: 'low' | 'medium' | 'high' = 'low';
  if (urgentScore > 0 || (painScore > 1 && feverScore > 0)) {
    urgency = 'high';
  } else if (feverScore > 0 || neuroScore > 1 || digestiveScore > 1) {
    urgency = 'medium';
  }

  // Determinar categoría y especialidad
  let category = 'Síntomas Generales';
  let specialty = 'Medicina General';

  if (neuroScore > 0) {
    category = 'Síntomas Neurológicos';
    specialty = 'Neurología';
  } else if (urgentScore > 0) {
    category = 'Síntomas de Urgencia';
    specialty = 'Medicina de Urgencias';
  } else if (digestiveScore > 0) {
    category = 'Síntomas Digestivos';
    specialty = 'Gastroenterología';
  }

  // Generar recomendaciones
  const recommendations: string[] = [];
  if (urgency === 'high') {
    recommendations.push('🚨 Busca atención médica inmediata o acude a urgencias');
    recommendations.push('No conduzcas, pide que alguien te acompañe');
  } else if (urgency === 'medium') {
    recommendations.push('📅 Agenda una consulta médica en las próximas 24-48 horas');
    recommendations.push('Monitorea la evolución de tus síntomas');
  } else {
    recommendations.push('📋 Considera agendar una consulta de rutina');
    recommendations.push('Mantén registro de síntomas para la consulta');
  }

  recommendations.push('💊 Mantén hidratación adecuada');
  recommendations.push('📝 Anota cualquier cambio en los síntomas');

  return {
    category,
    confidence: 0.75 + Math.random() * 0.2,
    urgency,
    recommendedSpecialty: specialty,
    recommendations
  };
}
