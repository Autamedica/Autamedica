import { logger } from '@autamedica/shared';
import { resolveServerEnv } from '../patients/server/ai-provider';

export interface PatientCareGuide {
  consejosToma: string;
  queHacerAnteOlvidos: string;
  efectosEsperados: string;
  recomendacionesClinicas: string;
}

export interface PatientCareGuideResult {
  guide: PatientCareGuide;
  provider: 'gemini' | 'fallback';
  reason?: 'missing_api_key' | 'api_error' | 'parse_error' | 'exception';
  model: string;
  status?: number;
}

const GEMINI_GENERATE_CONTENT_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

/**
 * Prompt del sistema para el Enriquecimiento de Recetas Médicas en AutaMedica.
 * Diseñado para generar indicaciones clínicas claras y editables por el médico.
 */
function buildEnrichmentSystemPrompt(template: 'neutral' | 'female' | 'empathetic' = 'neutral'): string {
  let toneGuideline = '';
  if (template === 'female') {
    toneGuideline = 'Tono de comunicación: clínico, claro y profesional. Si se menciona a la profesional firmante, usar concordancia femenina. Evitar promesas, exageraciones, informalidad y lenguaje comercial.';
  } else if (template === 'empathetic') {
    toneGuideline = 'Tono de comunicación: empático y simple, manteniendo registro médico profesional. Se permite voseo rioplatense moderado. Evitar chistes, exageraciones, frases marketineras y familiaridad excesiva.';
  } else {
    toneGuideline = 'Tono de comunicación: neutro, formal, clínico y descriptivo. Redactar en tercera persona de forma objetiva.';
  }

  return [
    'Rol: Médico clínico y farmacéutico senior especializado en comunicación médica personalizada y educación para la salud.',
    'Misión: transformar los datos de una prescripción y el diagnóstico en indicaciones para el paciente, claras, seguras y revisables por el médico firmante.',
    toneGuideline,
    'Reglas de autoría y determinismo:',
    '- Escribir como indicación médica final, no como sugerencia de IA.',
    '- No mencionar IA, automatización, sistema, modelo, recomendación generada ni "su médico prescriptor".',
    '- Si la dosis, frecuencia, duración o instrucciones vienen informadas, copiarlas de forma concreta y sin alternativas.',
    '- Nunca inventar esquemas alternativos. Si frecuencia = "8" o "cada 8 horas", escribir "cada 8 horas"; no escribir "cada 8 o cada 12 horas".',
    '- Si un dato no fue informado, omitirlo o indicar "según indicación médica", pero no reemplazar datos existentes por opciones genéricas.',
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

function normalizeFrequencyForPatient(frequency?: string): string {
  const value = frequency?.trim();
  if (!value) return '';
  if (/^\d+$/.test(value)) return `cada ${value} horas`;
  return value;
}

function buildAdministrationLine(params: {
  medicationName: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
}): string {
  const medication = params.medicationName.trim();
  const pieces = [
    medication,
    params.dosage?.trim(),
    normalizeFrequencyForPatient(params.frequency),
    params.duration?.trim() ? `durante ${params.duration.trim()}` : '',
  ].filter(Boolean);
  const base = pieces.length > 0
    ? `Tomar ${pieces.join(', ')}.`
    : 'Tomar según indicación médica.';
  const instructions = params.instructions?.trim();
  return instructions ? `${base} ${instructions}` : base;
}

/**
 * Fallback clínico offline para cuando no haya API Key de Gemini o falle la conexión.
 */
function getClinicalFallbackGuide(
  medicationName: string,
  dosage?: string,
  frequency?: string,
  duration?: string,
  instructions?: string,
  diagnosis?: string,
  patientName = 'Paciente',
  template: 'neutral' | 'female' | 'empathetic' = 'neutral'
): PatientCareGuide {
  const normalizedMed = medicationName.toLowerCase();
  const normalizedDiag = (diagnosis ?? '').toLowerCase();
  const administration = buildAdministrationLine({
    medicationName,
    dosage,
    frequency,
    duration,
    instructions,
  });

  let salutation = `Hola ${patientName}`;
  let doctorTerm = 'el médico';

  if (template === 'female') {
    salutation = `Hola ${patientName}`;
    doctorTerm = 'esta profesional';
  } else if (template === 'empathetic') {
    salutation = `Hola ${patientName}`;
    doctorTerm = 'tu profesional de salud';
  }

  // Antibióticos (Amoxicilina, Ciprofloxacina, etc.)
  if (normalizedMed.includes('amox') || normalizedMed.includes('antibio') || normalizedMed.includes('cipro')) {
    const toma = template === 'empathetic'
      ? `${salutation}. ${administration} Puede tomarse con comida para reducir molestias digestivas. Completá el tratamiento indicado aunque los síntomas mejoren antes.`
      : `${salutation}. ${administration} Puede tomarse con o después de las comidas para reducir molestias digestivas. Completá el tratamiento indicado por ${doctorTerm}, aunque los síntomas mejoren antes. Evitá el consumo de alcohol durante el tratamiento.`;

    const olvido = template === 'empathetic'
      ? 'Si omitís una toma, tomala cuando lo recuerdes. Si falta poco para la próxima dosis, salteá la dosis omitida y continuá con el esquema habitual. No dupliques dosis.'
      : 'Si te olvidás de una dosis, tomala apenas te acuerdes. Sin embargo, si faltan menos de 3 horas para la siguiente toma, es mejor saltear la dosis olvidada y continuar con tu horario habitual. ¡Nunca tomes doble dosis para compensar!';

    const efectos = template === 'empathetic'
      ? 'Puede causar molestias digestivas leves o cambios de sabor. Consultá de inmediato si aparece sarpullido, hinchazón de labios o cara, dificultad para respirar o diarrea intensa.'
      : 'Es normal que sientas un sabor metálico o leves molestias estomacales. Alerta: Si presentás sarpullido en la piel, hinchazón en la cara o diarrea intensa y persistente, suspendé la toma y avisanos por el chat de inmediato.';

    const recom = template === 'empathetic'
      ? `Para acompañar la recuperación ${normalizedDiag ? `de ${diagnosis}` : 'del cuadro'}, priorizá descanso, hidratación y alimentación liviana.`
      : `Para acompañar tu recuperación ${normalizedDiag ? `de ${diagnosis}` : 'del cuadro infeccioso'}, priorizá el reposo, tomá abundante agua para mantenerte bien hidratado y consumí alimentos blandos y fáciles de digerir.`;

    return {
      consejosToma: toma,
      queHacerAnteOlvidos: olvido,
      efectosEsperados: efectos,
      recomendacionesClinicas: recom
    };
  }

  // Analgésicos/Antiinflamatorios (Ibuprofeno, Paracetamol, etc.)
  if (normalizedMed.includes('ibu') || normalizedMed.includes('parac') || normalizedMed.includes('aspir') || normalizedMed.includes('diclo')) {
    const toma = template === 'empathetic'
      ? `${salutation}. ${administration} Si es un antiinflamatorio, conviene tomarlo con comida para reducir molestias digestivas.`
      : `${salutation}. ${administration} Si es un antiinflamatorio, conviene tomarlo acompañado de alimentos para cuidar la mucosa gástrica.`;

    const olvido = template === 'empathetic'
      ? 'Si omitís una toma y continúa la indicación, podés tomarla al recordarlo. Si falta poco para la próxima dosis, omití la anterior. No dupliques dosis.'
      : 'Si omitís una dosis y el dolor persiste, podés tomarla en ese momento. Pero si ya es casi la hora de la siguiente, omitila y seguí con tu ritmo normal. No dupliques la dosis bajo ningún concepto.';

    const efectos = template === 'empathetic'
      ? 'Puede causar malestar digestivo. Consultá si aparece dolor abdominal intenso, acidez marcada, materia fecal oscura, vómitos persistentes o dificultad para respirar.'
      : 'Puede causar un leve malestar estomacal. Alerta: Si notás dolor de estómago severo, acidez intensa, evacuaciones oscuras o dificultad para respirar, suspendé su uso de forma inmediata.';

    const recom = template === 'empathetic'
      ? `Para acompañar el alivio ${normalizedDiag ? `de ${diagnosis}` : 'del dolor'}, evitá esfuerzos y aplicá medidas locales si fueron indicadas por el médico.`
      : `Para complementar el alivio ${normalizedDiag ? `de ${diagnosis}` : 'del dolor'}, te sugerimos aplicar compresas tibias o frías en la zona afectada según corresponda, evitar esfuerzos físicos innecesarios y mantener una postura relajada.`;

    return {
      consejosToma: toma,
      queHacerAnteOlvidos: olvido,
      efectosEsperados: efectos,
      recomendacionesClinicas: recom
    };
  }

  // Fallback genérico para otros medicamentos
  const tomaGen = template === 'empathetic'
    ? `${salutation}. ${administration} Acompañalo con agua, salvo que se haya indicado otra forma de administración.`
    : `${salutation}. ${administration} Acompañalo con un vaso de agua, salvo que se haya indicado otra forma de administración.`;

  const olvidoGen = template === 'empathetic'
    ? 'Si omitís una toma, tomala al recordarlo salvo que falte poco para la próxima dosis. En ese caso, salteá la dosis omitida. No dupliques dosis.'
    : 'Si te olvidás de una toma, consumila en cuanto te des cuenta, a menos que falte poco para la próxima. En ese caso, salteá la dosis omitida. Jamás tomes dos dosis al mismo tiempo.';

  const efectosGen = template === 'empathetic'
    ? 'Prestá atención a síntomas nuevos durante los primeros días. Consultá si aparecen mareos intensos, dificultad para respirar, reacción alérgica o cualquier síntoma que preocupe.'
    : 'Prestá atención a cómo se siente tu cuerpo durante los primeros días. Si notás mareos intensos, dificultad para respirar, sarpullidos o cualquier síntoma inusual, suspendé la toma y ponete en contacto con nosotros.';

  const recomGen = template === 'empathetic'
    ? 'Mantené descanso adecuado, hidratación y alimentación regular durante el tratamiento.'
    : 'Te aconsejamos mantener descanso adecuado, hidratación regular y alimentación equilibrada durante el tratamiento.';

  return {
    consejosToma: tomaGen,
    queHacerAnteOlvidos: olvidoGen,
    efectosEsperados: efectosGen,
    recomendacionesClinicas: recomGen
  };
}

export async function generatePatientCareGuide(params: {
  medicationName: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  diagnosis?: string;
  patientName?: string;
  careGuideTemplate?: 'neutral' | 'female' | 'empathetic';
}): Promise<PatientCareGuide> {
  return (await generatePatientCareGuideResult(params)).guide;
}

export async function generatePatientCareGuideResult(params: {
  medicationName: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  diagnosis?: string;
  patientName?: string;
  careGuideTemplate?: 'neutral' | 'female' | 'empathetic';
}): Promise<PatientCareGuideResult> {
  const { medicationName, dosage, frequency, duration, instructions, diagnosis, patientName, careGuideTemplate = 'neutral' } = params;
  const apiKey = resolveServerEnv('GEMINI_API_KEY');
  const model =
    resolveServerEnv('PRESCRIPTION_CARE_GUIDE_MODEL') ??
    resolveServerEnv('ANAMNESIS_AI_GEMINI_MODEL') ??
    DEFAULT_MODEL;

  if (!apiKey) {
    logger.info('[generatePatientCareGuide] No GEMINI_API_KEY configured, returning smart clinical fallback');
    return {
      guide: getClinicalFallbackGuide(
        medicationName,
        dosage,
        frequency,
        duration,
        instructions,
        diagnosis,
        patientName,
        careGuideTemplate,
      ),
      provider: 'fallback',
      reason: 'missing_api_key',
      model,
    };
  }

  try {
    const response = await fetch(
      `${GEMINI_GENERATE_CONTENT_URL}/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildEnrichmentSystemPrompt(careGuideTemplate) }],
          },
          contents: [
            {
              role: 'user',
              parts: [{
                text: [
                  'DATOS DE LA PRESCRIPCIÓN CLÍNICA:',
                  `- Medicamento: ${medicationName}`,
                  dosage ? `- Dosificación: ${dosage}` : '',
                  frequency ? `- Frecuencia: ${frequency}` : '',
                  duration ? `- Duración: ${duration}` : '',
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
      logger.error('[generatePatientCareGuide] Gemini API request failed', {
        status: response.status,
        model,
      });
      return {
        guide: getClinicalFallbackGuide(
          medicationName,
          dosage,
          frequency,
          duration,
          instructions,
          diagnosis,
          patientName,
          careGuideTemplate,
        ),
        provider: 'fallback',
        reason: 'api_error',
        model,
        status: response.status,
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    
    // Parsear el output de Gemini
    if (payload?.candidates && Array.isArray(payload.candidates) && payload.candidates[0]?.content?.parts?.[0]?.text) {
      const jsonText = payload.candidates[0].content.parts[0].text.trim();
      const parsed = JSON.parse(jsonText) as PatientCareGuide;
      
      if (parsed.consejosToma && parsed.queHacerAnteOlvidos && parsed.efectosEsperados && parsed.recomendacionesClinicas) {
        logger.info('[generatePatientCareGuide] Successfully generated patient care guide via Gemini');
        return {
          guide: parsed,
          provider: 'gemini',
          model,
        };
      }
    }

    logger.warn('[generatePatientCareGuide] Parsing Gemini response failed, using clinical fallback');
    return {
      guide: getClinicalFallbackGuide(
        medicationName,
        dosage,
        frequency,
        duration,
        instructions,
        diagnosis,
        patientName,
        careGuideTemplate,
      ),
      provider: 'fallback',
      reason: 'parse_error',
      model,
    };
  } catch (error) {
    logger.error('[generatePatientCareGuide] Error calling Gemini API', {
      error: error instanceof Error ? error.message : String(error)
    });
    return {
      guide: getClinicalFallbackGuide(
        medicationName,
        dosage,
        frequency,
        duration,
        instructions,
        diagnosis,
        patientName,
        careGuideTemplate,
      ),
      provider: 'fallback',
      reason: 'exception',
      model,
    };
  }
}
