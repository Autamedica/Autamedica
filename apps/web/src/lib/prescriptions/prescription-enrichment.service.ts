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
function buildEnrichmentSystemPrompt(template: 'neutral' | 'female' | 'empathetic' = 'neutral'): string {
  let toneGuideline = '';
  if (template === 'female') {
    toneGuideline = 'Tono de comunicación: Redacta SIEMPRE en primera persona del femenino ("soy tu doctora", "soy tu médica", "te receté", "te indico", "estoy a tu disposición"). Utiliza una concordancia de género 100% femenina para la profesional firmante. El tono debe ser sumamente empático, cercano, contenedor y profesional.';
  } else if (template === 'empathetic') {
    toneGuideline = 'Tono de comunicación: Altamente empático, amigable, cálido y sumamente cercano. Utiliza el voseo rioplatense argentino de forma muy natural ("tomalo", "hacelo", "cuidate", "consultame", "sentirse de diez"). Explica todo con palabras sumamente sencillas y llanas, evitando cualquier formalidad o tecnicismo innecesario.';
  } else {
    toneGuideline = 'Tono de comunicación: Neutro, formal, clínico, descriptivo y sumamente profesional. Redacta en tercera persona de forma objetiva ("se prescribe", "se recomienda tomar", "es fundamental cumplir con la dosis").';
  }

  return [
    'Rol: Médico clínico y farmacéutico senior especializado en comunicación médica personalizada y educación para la salud.',
    'Misión: Recibir los datos crudos de una receta médica y el diagnóstico del paciente, y transformarlos en una "Guía de Cuidado del Paciente" hiper-personalizada, de altísimo valor humano y educativo.',
    toneGuideline,
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
  patientName = 'Paciente',
  template: 'neutral' | 'female' | 'empathetic' = 'neutral'
): PatientCareGuide {
  const normalizedMed = medicationName.toLowerCase();
  const normalizedDiag = (diagnosis ?? '').toLowerCase();

  let salutation = `Hola ${patientName}`;
  let doctorTerm = 'el médico';

  if (template === 'female') {
    salutation = `Hola ${patientName}, soy tu doctora`;
    doctorTerm = 'esta profesional';
  } else if (template === 'empathetic') {
    salutation = `¡Hola ${patientName}! Para ayudarte a sentirte de diez`;
    doctorTerm = 'tu profesional de confianza';
  }

  // Antibióticos (Amoxicilina, Ciprofloxacina, etc.)
  if (normalizedMed.includes('amox') || normalizedMed.includes('antibio') || normalizedMed.includes('cipro')) {
    const toma = template === 'empathetic'
      ? `${salutation}, recordá tomar este antibiótico respetando a rajatabla las horas indicadas para que te haga efecto. Es clave tomarlo con algo de comida para cuidar la panza. Completá todos los días indicados, por más que te sientas de diez antes.`
      : `${salutation}, recordá tomar este antibiótico respetando estrictamente las horas indicadas para que mantenga su efecto. Es ideal tomarlo con o justo después de las comidas para proteger tu estómago. Completá los días indicados por ${doctorTerm}, aunque te sientas mejor antes. Evitá el consumo de alcohol durante el tratamiento.`;

    const olvido = template === 'empathetic'
      ? 'Si te olvidás de una toma, metele apenas te acuerdes. Pero si ya falta re poco para la siguiente, salteala y seguí con tu ritmo normal. ¡Bajo ningún concepto dupliques la dosis!'
      : 'Si te olvidás de una dosis, tomala apenas te acuerdes. Sin embargo, si faltan menos de 3 horas para la siguiente toma, es mejor saltear la dosis olvidada y continuar con tu horario habitual. ¡Nunca tomes doble dosis para compensar!';

    const efectos = template === 'empathetic'
      ? 'Puede que sientas un sabor raro o algo de molestia en la panza. Alerta: Si te sale algún sarpullido, se te hincha la cara o tenés diarrea muy fuerte, suspendé al toque y avisanos por el chat.'
      : 'Es normal que sientas un sabor metálico o leves molestias estomacales. Alerta: Si presentás sarpullido en la piel, hinchazón en la cara o diarrea intensa y persistente, suspendé la toma y avisanos por el chat de inmediato.';

    const recom = template === 'empathetic'
      ? `Para ponerle el pecho a tu recuperación ${normalizedDiag ? `de ${diagnosis}` : 'de este cuadro'}, priorizá el descanso, tomá abundante agua para hidratarte bien y comé livianito.`
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
      ? `${salutation}, este analgésico te va a ayudar un montón a calmar el dolor y desinflamar. Tomalo siempre con un vaso de leche o comida para proteger la panza. Usalo sólo cuando te duela, respetando las horas recomendadas.`
      : `${salutation}, este analgésico ayuda a calmar el dolor y desinflamar. Tomalo siempre acompañado de alimentos o un vaso de leche para cuidar la mucosa gástrica. Usalo únicamente mientras persistan las molestias, respetando el intervalo de horas prescrito.`;

    const olvido = template === 'empathetic'
      ? 'Si te salteás una toma y te sigue doliendo, tomala en ese momento. Pero si ya casi es hora de la próxima, dejala pasar y seguí con tu ritmo normal. No dupliques la dosis por nada del mundo.'
      : 'Si omitís una dosis y el dolor persiste, podés tomarla en ese momento. Pero si ya es casi la hora de la siguiente, omitila y seguí con tu ritmo normal. No dupliques la dosis bajo ningún concepto.';

    const efectos = template === 'empathetic'
      ? 'A veces cae un toque pesado al estómago. Alerta: Si sentís un dolor de panza muy fuerte, acidez insoportable, o te cuesta respirar, suspendelo al toque.'
      : 'Puede causar un leve malestar estomacal. Alerta: Si notás dolor de estómago severo, acidez intensa, evacuaciones oscuras o dificultad para respirar, suspendé su uso de forma inmediata.';

    const recom = template === 'empathetic'
      ? `Para sentirte mejor ${normalizedDiag ? `de ${diagnosis}` : 'del dolor'}, te sugiero ponerte paños tibios o fríos en la zona que te jode, evitá hacer fuerza y mantenete en una posición súper relajada.`
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
    ? `${salutation}, para que te haga un efecto de diez, te recomiendo tomar el medicamento siempre en los mismos horarios todos los días. Acompañalo con un vaso de agua.`
    : `${salutation}, para obtener los mejores resultados, te recomendamos tomar este medicamento en los mismos horarios todos los días. Acompañalo con un vaso de agua y consultá las indicaciones de tu médico sobre la relación con las comidas.`;

  const olvidoGen = template === 'empathetic'
    ? 'Si te olvidás de tomarlo, metele en cuanto te des cuenta, salvo que falte re poco para la siguiente dosis. Ahí salteala y seguí normal. Jamás tomes dos juntas.'
    : 'Si te olvidás de una toma, consumila en cuanto te des cuenta, a menos que falte poco para la próxima. En ese caso, salteá la dosis omitida. Jamás tomes dos dosis al mismo tiempo.';

  const efectosGen = template === 'empathetic'
    ? 'Fijate cómo reacciona tu cuerpo los primeros días. Si te sentís muy mareado, te cuesta respirar o te sale alguna alergia, suspendé la toma de inmediato y escribinos.'
    : 'Prestá atención a cómo se siente tu cuerpo durante los primeros días. Si notás mareos intensos, dificultad para respirar, sarpullidos o cualquier síntoma inusual, suspendé la toma y ponete en contacto con nosotros.';

  const recomGen = template === 'empathetic'
    ? 'Te aconsejo descansar bien, tomar bastante agua y comer sano para ayudar a que te recuperes volando.'
    : 'Te aconsejamos mantener un descanso adecuado, hidratación regular y llevar una alimentación equilibrada para ayudar a que tu tratamiento sea 100% efectivo.';

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
  instructions?: string;
  diagnosis?: string;
  patientName?: string;
  careGuideTemplate?: 'neutral' | 'female' | 'empathetic';
}): Promise<PatientCareGuide> {
  const { medicationName, dosage, instructions, diagnosis, patientName, careGuideTemplate = 'neutral' } = params;
  const apiKey = resolveServerEnv('GEMINI_API_KEY');

  if (!apiKey) {
    logger.info('[generatePatientCareGuide] No GEMINI_API_KEY configured, returning smart clinical fallback');
    return getClinicalFallbackGuide(medicationName, diagnosis, patientName, careGuideTemplate);
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
      return getClinicalFallbackGuide(medicationName, diagnosis, patientName, careGuideTemplate);
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
    return getClinicalFallbackGuide(medicationName, diagnosis, patientName, careGuideTemplate);
  } catch (error) {
    logger.error('[generatePatientCareGuide] Error calling Gemini API', {
      error: error instanceof Error ? error.message : String(error)
    });
    return getClinicalFallbackGuide(medicationName, diagnosis, patientName, careGuideTemplate);
  }
}
