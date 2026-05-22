import { logger } from '@autamedica/shared';
import { resolveServerEnv } from '../patients/server/ai-provider';

export interface PatientCareGuide {
  consejosToma: string;
  queHacerAnteOlvidos: string;
  efectosEsperados: string;
  recomendacionesClinicas: string;
}

const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-3-flash-preview';

/**
 * Prompt del sistema para el Enriquecimiento de Recetas Médicas en AutaMedica.
 * Diseñado para generar guías de acompañamiento amigables, seguras y empáticas.
 */
function buildEnrichmentSystemPrompt(): string {
  return [
    'Rol: Médico clínico y farmacéutico senior especializado en comunicación empática y educación para la salud.',
    'Misión: Recibir los datos crudos de una receta médica y el diagnóstico del paciente, y transformarlos en una "Guía de Cuidado del Paciente" hiper-personalizada, de altísimo valor humano y educativo.',
    'Tono de comunicación: Cálido, tranquilizador, claro y cercano (español amigable con voseo sutil o neutro pero empático). No usar tecnicismos complejos sin explicarlos de forma simple.',
    'Pautas clínicas obligatorias:',
    '- Consejos de Toma: Explicar claramente cómo y cuándo tomar el medicamento, si conviene tomarlo con alimentos para evitar malestar estomacal, horarios sugeridos y evitar interacciones críticas (ej. no tomar alcohol ni mezclar antibióticos con lácteos si aplica).',
    '- Qué hacer ante olvidos: Dar una instrucción precisa y libre de pánico. Por regla general: tomar apenas se recuerde, pero si falta poco para la próxima dosis, saltearla y continuar con el esquema regular. Advertir firmemente NO duplicar dosis.',
    '- Efectos Esperados y Alertas: Diferenciar claramente síntomas normales/tolerables (ej. leve náusea, somnolencia) de signos de alarma que exigen suspender de inmediato el fármaco y consultar a urgencias (ej. sarpullido severo, dificultad respiratoria, hinchazón de cara/labios).',
    '- Recomendaciones Clínicas: Dar pautas higiénico-dietéticas de autocuidado específicas para el diagnóstico (ej. para gripe/angina: hidratación y reposo; para dolor de espalda: calor local; para hipertensión: disminuir la sal).',
    'Restricción absoluta: Devolver únicamente el objeto JSON solicitado con las 4 claves, sin texto de introducción ni de cierre.'
  ].join('\n');
}

/**
 * Estructura JSON esperada por el servicio.
 */
function getEnrichmentResponseSchema(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      consejosToma: {
        type: 'string',
        description: 'Explicación cálida sobre cómo y cuándo tomar el fármaco, dosis, alimentos e interacciones.'
      },
      queHacerAnteOlvidos: {
        type: 'string',
        description: 'Instrucciones precisas sobre qué hacer si el paciente omite una dosis. Regla segura de no duplicar.'
      },
      efectosEsperados: {
        type: 'string',
        description: 'Efectos secundarios comunes y benignos versus síntomas de alerta crítica para suspender el tratamiento.'
      },
      recomendacionesClinicas: {
        type: 'string',
        description: 'Recomendaciones higiénico-dietéticas, hidratación, reposo o cuidados generales basados en el diagnóstico del paciente.'
      }
    },
    required: ['consejosToma', 'queHacerAnteOlvidos', 'efectosEsperados', 'recomendacionesClinicas'],
    additionalProperties: false
  };
}

/**
 * Fallback clínico offline para cuando no haya API Key de Gemini o falle la conexión.
 * Garantiza que la experiencia del usuario sea premium en cualquier circunstancia.
 */
function getClinicalFallbackGuide(
  medicationName: string,
  diagnosis?: string,
  patientName = 'Paciente'
): PatientCareGuide {
  const normalizedMed = medicationName.toLowerCase();
  const normalizedDiag = (diagnosis ?? '').toLowerCase();

  // Antibióticos (Amoxicilina, Ciprofloxacina, etc.)
  if (normalizedMed.includes('amox') || normalizedMed.includes('antibio') || normalizedMed.includes('cipro')) {
    return {
      consejosToma: `Hola ${patientName}, recordá tomar este antibiótico respetando estrictamente las horas indicadas para que mantenga su efecto. Es ideal tomarlo con o justo después de las comidas para proteger tu estómago. Completá los días indicados por el médico, aunque te sientas mejor antes. Evitá el consumo de alcohol durante el tratamiento.`,
      queHacerAnteOlvidos: 'Si te olvidás de una dosis, tomala apenas te acuerdes. Sin embargo, si faltan menos de 3 horas para la siguiente toma, es mejor saltear la dosis olvidada y continuar con tu horario habitual. ¡Nunca tomes doble dosis para compensar!',
      efectosEsperados: 'Es normal que sientas un sabor metálico o leves molestias estomacales. Alerta: Si presentás sarpullido en la piel, hinchazón en la cara o diarrea intensa y persistente, suspendé la toma y avisanos por el chat de inmediato.',
      recomendacionesClinicas: `Para acompañar tu recuperación ${normalizedDiag ? `de ${diagnosis}` : 'del cuadro infeccioso'}, priorizá el reposo, tomá abundante agua para mantenerte bien hidratado y consumí alimentos blandos y fáciles de digerir.`
    };
  }

  // Analgésicos/Antiinflamatorios (Ibuprofeno, Paracetamol, etc.)
  if (normalizedMed.includes('ibu') || normalizedMed.includes('parac') || normalizedMed.includes('aspir') || normalizedMed.includes('diclo')) {
    return {
      consejosToma: `Hola ${patientName}, este analgésico ayuda a calmar el dolor y desinflamar. Tomalo siempre acompañado de alimentos o un vaso de leche para cuidar la mucosa gástrica. Usalo únicamente mientras persistan las molestias, respetando el intervalo de horas prescrito.`,
      queHacerAnteOlvidos: 'Si omitís una dosis y el dolor persiste, podés tomarla en ese momento. Pero si ya es casi la hora de la siguiente, omitila y seguí con tu ritmo normal. No dupliques la dosis bajo ningún concepto.',
      efectosEsperados: 'Puede causar un leve malestar estomacal. Alerta: Si notás dolor de estómago severo, acidez intensa, evacuaciones oscuras o dificultad para respirar, suspendé su uso de forma inmediata.',
      recomendacionesClinicas: `Para complementar el alivio ${normalizedDiag ? `de ${diagnosis}` : 'del dolor'}, te sugerimos aplicar compresas tibias o frías en la zona afectada según corresponda, evitar esfuerzos físicos innecesarios y mantener una postura relajada.`
    };
  }

  // Fallback genérico para otros medicamentos
  return {
    consejosToma: `Hola ${patientName}, para obtener los mejores resultados, te recomendamos tomar este medicamento en los mismos horarios todos los días. Acompañalo con un vaso de agua y consultá las indicaciones de tu médico sobre la relación con las comidas.`,
    queHacerAnteOlvidos: 'Si te olvidás de una toma, consumila en cuanto te des cuenta, a menos que falte poco para la próxima. En ese caso, salteá la dosis omitida. Jamás tomes dos dosis al mismo tiempo.',
    efectosEsperados: 'Prestá atención a cómo se siente tu cuerpo durante los primeros días. Si notás mareos intensos, dificultad para respirar, sarpullidos o cualquier síntoma inusual, suspendé la toma y ponete en contacto con nosotros.',
    recomendacionesClinicas: `Te aconsejamos mantener un descanso adecuado, hidratación regular y llevar una alimentación equilibrada para ayudar a que tu tratamiento sea 100% efectivo.`
  };
}

export async function generatePatientCareGuide(params: {
  medicationName: string;
  dosage?: string;
  instructions?: string;
  diagnosis?: string;
  patientName?: string;
}): Promise<PatientCareGuide> {
  const { medicationName, dosage, instructions, diagnosis, patientName } = params;
  const apiKey = resolveServerEnv('GEMINI_API_KEY');

  if (!apiKey) {
    logger.info('[generatePatientCareGuide] No GEMINI_API_KEY configured, returning smart clinical fallback');
    return getClinicalFallbackGuide(medicationName, diagnosis, patientName);
  }

  try {
    const response = await fetch(
      `${GEMINI_GENERATE_CONTENT_URL}/${DEFAULT_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildEnrichmentSystemPrompt() }],
          },
          contents: [
            {
              role: 'user',
              parts: [{
                text: [
                  'DATOS DE LA PRESCRIPCIÓN CLÍNICA:',
                  `- Medicamento: ${medicationName}`,
                  dosage ? `- Dosificación: ${dosage}` : '',
                  instructions ? `- Instrucciones médicas: ${instructions}` : '',
                  diagnosis ? `- Diagnóstico clínico: ${diagnosis}` : '',
                  patientName ? `- Nombre del Paciente: ${patientName}` : '',
                  '',
                  'SCHEMA DE RESPUESTA OBLIGATORIO (JSON Schema):',
                  JSON.stringify(getEnrichmentResponseSchema()),
                  '',
                  'Responde EXCLUSIVAMENTE con el JSON que cumpla este schema. Sin textos adicionales de ningún tipo.',
                ].filter(Boolean).join('\n'),
              }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    if (!response.ok) {
      logger.error('[generatePatientCareGuide] Gemini API request failed', { status: response.status });
      return getClinicalFallbackGuide(medicationName, diagnosis, patientName);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    
    // Parsear el output de Gemini
    if (payload?.candidates && Array.isArray(payload.candidates) && payload.candidates[0]?.content?.parts?.[0]?.text) {
      const jsonText = payload.candidates[0].content.parts[0].text.trim();
      const parsed = JSON.parse(jsonText) as PatientCareGuide;
      
      if (parsed.consejosToma && parsed.queHacerAnteOlvidos && parsed.efectosEsperados && parsed.recomendacionesClinicas) {
        logger.info('[generatePatientCareGuide] Successfully generated patient care guide via Gemini');
        return parsed;
      }
    }

    logger.warn('[generatePatientCareGuide] Parsing Gemini response failed, using clinical fallback');
    return getClinicalFallbackGuide(medicationName, diagnosis, patientName);
  } catch (error) {
    logger.error('[generatePatientCareGuide] Error calling Gemini API', {
      error: error instanceof Error ? error.message : String(error)
    });
    return getClinicalFallbackGuide(medicationName, diagnosis, patientName);
  }
}
