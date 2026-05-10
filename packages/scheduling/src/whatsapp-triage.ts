/**
 * WhatsApp Triage — "CONOCER MI SALUD"
 *
 * Motor de triaje conversacional vía WhatsApp para adultos mayores.
 * Una pregunta por mensaje, lenguaje simple, sin necesidad de app.
 *
 * Flujo:
 * 1. Paciente responde "SALUD" o "CONOCER" a un mensaje de AutaMedica
 * 2. El inbound-watcher detecta parsed_response === 'health_check'
 * 3. Se inicia (o continúa) una sesión de triaje en whatsapp_triage_sessions
 * 4. Cada respuesta del paciente avanza a la siguiente pregunta
 * 5. Al completar, se genera un resumen con alertas
 */

import type { SupabaseLike } from './supabase';
import { sendMessageWithFallback, type OpenClawConfig } from './openclaw';
import { processTriageWithAI, type TriageAIOutput } from './triage-ai-processor';

// ==========================================
// Tipos
// ==========================================

export interface TriageQuestion {
  id: string;
  question: string;
  field: string;
  type: 'text' | 'yesno' | 'scale' | 'symptoms' | 'medications';
}

export interface TriageSession {
  id?: string;
  session_id: string;
  patient_phone: string;
  patient_name: string;
  current_question: number;
  answers: Record<string, string>;
  started_at: string;
  last_activity_at: string;
  status: 'active' | 'completed' | 'abandoned';
}

// ==========================================
// Banco de preguntas (7 preguntas, ~2-3 min)
// ==========================================

export const TRIAGE_QUESTIONS: TriageQuestion[] = [
  {
    id: 'q1_edad',
    question: '¿Cuántos años tenés?\n\nEscribí el número nomás, por ejemplo: 72',
    field: 'age',
    type: 'text',
  },
  {
    id: 'q2_motivo',
    question: '¿Qué es lo que más te preocupa de tu salud hoy?\n\nContame con tus palabras, sin apuro.',
    field: 'main_concern',
    type: 'text',
  },
  {
    id: 'q3_sintomas',
    question: '¿Tenés alguno de estos síntomas ahora o en la última semana?\n\nEscribí todos los que tengas. Por ejemplo:\n• Dolor de cabeza\n• Cansancio\n• Falta de aire\n• Mareos\n• Dolor en el pecho\n\nSi no tenés ninguno, respondé: *NINGUNO*',
    field: 'current_symptoms',
    type: 'symptoms',
  },
  {
    id: 'q4_medicamentos',
    question: '¿Qué medicamentos tomás actualmente?\n\nEscribí los nombres si los sabés, o respondé:\n• *NO SÉ* — si no te acordás ahora\n• *NINGUNO* — si no tomás nada',
    field: 'medications',
    type: 'medications',
  },
  {
    id: 'q5_sueno',
    question: '¿Dormiste bien anoche?\n\nRespondé:\n✅ *BIEN*\n⚠️ *MÁS O MENOS*\n❌ *MAL*',
    field: 'sleep_quality',
    type: 'scale',
  },
  {
    id: 'q6_estado_animo',
    question: '¿Cómo te sentís de ánimo hoy?\n\nRespondé:\n😊 *BIEN*\n😐 *NORMAL*\n😔 *BAJO*',
    field: 'mood',
    type: 'scale',
  },
  {
    id: 'q7_dolor',
    question: '¿Tenés dolor en alguna parte del cuerpo?\n\nRespondé:\n• *NO*\n• *POCO*\n• *BASTANTE*\n• *MUCHO*',
    field: 'pain_level',
    type: 'scale',
  },
];

// ==========================================
// Mensajes del sistema
// ==========================================

export function buildHealthCheckWelcome(patientName: string): string {
  return [
    `🩺 *Consultá tu salud sin salir de casa — AutaMedica*`,
    ``,
    `Hola ${patientName}, bienvenida/o.`,
    ``,
    `Te voy a hacer 7 preguntas simples para entender cómo está tu salud hoy.`,
    ``,
    `⚠️ *Importante:* Esto no reemplaza a tu médico.`,
    `Si tenés una emergencia, llamá al 107 (SAME) o andá a la guardia.`,
    ``,
    `¿Estás listo/a? Respondé:`,
    `✅ *SÍ* — para empezar`,
    `❌ *NO* — si preferís no hacerlo ahora`,
  ].join('\n');
}

export function buildNextQuestion(
  questionIndex: number,
  patientName: string,
): { message: string; isComplete: boolean } {
  if (questionIndex >= TRIAGE_QUESTIONS.length) {
    return {
      message: `✅ Ya tengo todo lo que necesito, ${patientName}. Procesando tu chequeo de salud...`,
      isComplete: true,
    };
  }

  const q = TRIAGE_QUESTIONS[questionIndex]!;
  const progress = `Pregunta ${questionIndex + 1} de ${TRIAGE_QUESTIONS.length}`;

  return {
    message: [
      `📝 *${progress}*`,
      ``,
      q.question,
    ].join('\n'),
    isComplete: false,
  };
}

export function buildHealthCheckSummary(
  patientName: string,
  answers: Record<string, string>,
  sessionId?: string,
): string {
  const alerts: string[] = [];
  const age = answers.age || answers.q1_edad || '?';
  const mainConcernText = answers.main_concern || answers.q2_motivo || '';
  const symptomsText = answers.current_symptoms || answers.q3_sintomas || '';
  const medicationsText = answers.medications || answers.q4_medicamentos || '';
  const sleepQuality = answers.sleep_quality || answers.q5_sueno || '';
  const mood = answers.mood || answers.q6_estado_animo || '';
  const painLevelText = answers.pain_level || answers.q7_dolor || '';
  const mainConcern = mainConcernText.toLowerCase();
  const symptoms = symptomsText.toLowerCase();
  const painLevel = painLevelText.toLowerCase();

  // 🚨 Alertas rojas — emergencia
  const redFlags = [
    'dolor en el pecho', 'dolor de pecho', 'falta de aire',
    'no puedo respirar', 'me estoy ahogando', 'perdida de conocimiento',
    'desmayo', 'convulsión', 'convulsion', 'sangre', 'sangrado',
  ];

  for (const flag of redFlags) {
    if (mainConcern.includes(flag) || symptoms.includes(flag)) {
      alerts.push(`🚨 *URGENTE:* Mencionaste "${flag}". No esperes. Consultá a un médico hoy mismo o llamá al 107 (SAME).`);
      break;
    }
  }

  // ⚠️ Alertas amarillas — consultar pronto
  if (!alerts.some(a => a.includes('URGENTE'))) {
    const yellowFlags = [
      'mareo', 'mareos', 'dolor de cabeza fuerte', 'cansancio extremo',
      'no duermo', 'insomnio', 'falta de apetito', 'bajé de peso',
      'me caí', 'me cai', 'golpe', 'fiebre',
    ];

    for (const flag of yellowFlags) {
      if (mainConcern.includes(flag) || symptoms.includes(flag)) {
        alerts.push(`⚠️ *ATENCIÓN:* Sería bueno que un médico te revise esta semana.`);
        break;
      }
    }
  }

  // Dolor significativo
  if ((painLevel.includes('bastante') || painLevel.includes('mucho')) && !alerts.some(a => a.includes('URGENTE'))) {
    alerts.push(`⚠️ *DOLOR:* Tenés dolor que merece atención médica. Te recomendamos consultar pronto.`);
  }

  const alertSection = alerts.length > 0
    ? `\n⚠️ *ALERTAS DE SALUD:*\n${alerts.map(a => `• ${a}`).join('\n')}`
    : `\n✅ *No detectamos señales de alerta graves.*\nSiempre es bueno que un médico te revise igual.`;

  return [
    `📋 *Tu chequeo de salud — Resumen*`,
    ``,
    `👤 *${patientName}* — ${age} años`,
    ``,
    `📌 *Lo que más te preocupa:*`,
    `_"${mainConcernText || 'No especificado'}"_`,
    ``,
    `🔍 *Síntomas:* ${symptomsText || 'Ninguno'}`,
    `💊 *Medicamentos:* ${medicationsText || 'No especificado'}`,
    `😴 *Sueño:* ${sleepQuality || '-'}`,
    `😊 *Ánimo:* ${mood || '-'}`,
    `🩹 *Dolor:* ${painLevelText || '-'}`,
    ``,
    alertSection,
    ``,
    `🧑‍⚕️ *¿Querés hablar con un médico ahora?*`,
    `Respondé *DOCTOR* y te contactamos para agendar.`,
    ``,
    `📋 *Tu informe médico en PDF:*`,
    `autamedica.com/api/triage/pdf?session=${sessionId || 'consulta'}`,
    ``,
    `_AutaMedica — Cuidamos tu salud, sin salir de casa._ 🏥`,
  ].join('\n');
}

type TriageAnswerValidation =
  | { ok: true; value: string }
  | { ok: false; reason: string };

function normalizeAnswerText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function hasUsableFreeText(value: string): boolean {
  const normalized = normalizeAnswerText(value);
  const compact = normalized.replace(/\s/g, '');
  if (compact.length < 2) return false;
  if (/^(.)\1{4,}$/.test(compact)) return false;
  if (/^[^a-z0-9]+$/.test(compact)) return false;

  const offTopic = [
    'hola',
    'hol',
    'buenas',
    'menu',
    'volver',
    'opciones',
    'gracias',
    'test',
    'prueba',
    'asdf',
    'qwerty',
    'jaja',
    'ok',
    'dale',
  ];

  return !offTopic.includes(normalized);
}

function mapScaleAnswer(question: TriageQuestion, rawText: string): string | null {
  const normalized = normalizeAnswerText(rawText);

  if (question.field === 'sleep_quality') {
    if (['bien', 'bueno', 'buena', 'si', 'si dormi bien'].includes(normalized)) return 'BIEN';
    if (['mas o menos', 'masomenos', 'regular', 'medio', 'normal'].includes(normalized)) return 'MÁS O MENOS';
    if (['mal', 'no', 'no dormi', 'poco', 'pesimo', 'pesima', 'insomnio'].includes(normalized)) return 'MAL';
  }

  if (question.field === 'mood') {
    if (['bien', 'bueno', 'buena', 'tranquilo', 'tranquila'].includes(normalized)) return 'BIEN';
    if (['normal', 'regular', 'mas o menos', 'masomenos'].includes(normalized)) return 'NORMAL';
    if (['bajo', 'baja', 'mal', 'triste', 'ansioso', 'ansiosa', 'decaido', 'decaida'].includes(normalized)) return 'BAJO';
  }

  if (question.field === 'pain_level') {
    if (['no', 'nada', 'ninguno', 'ninguna', 'sin dolor', '0'].includes(normalized)) return 'NO';
    if (['poco', 'leve', '1', '2', '3'].includes(normalized)) return 'POCO';
    if (['bastante', 'moderado', 'moderada', '4', '5', '6', '7'].includes(normalized)) return 'BASTANTE';
    if (['mucho', 'fuerte', 'intenso', 'intensa', '8', '9', '10'].includes(normalized)) return 'MUCHO';
  }

  return null;
}

function validateTriageAnswer(question: TriageQuestion, rawText: string): TriageAnswerValidation {
  const trimmed = rawText.trim();
  const normalized = normalizeAnswerText(rawText);

  if (question.field === 'age') {
    if (!/^\d{1,3}$/.test(normalized)) {
      return { ok: false, reason: 'Necesito la edad en número.' };
    }

    const age = Number.parseInt(normalized, 10);
    if (age < 1 || age > 120) {
      return { ok: false, reason: 'La edad tiene que estar entre 1 y 120 años.' };
    }

    return { ok: true, value: String(age) };
  }

  if (question.type === 'scale') {
    const mapped = mapScaleAnswer(question, rawText);
    if (!mapped) {
      return { ok: false, reason: 'Necesito que elijas una de las opciones de la pregunta.' };
    }
    return { ok: true, value: mapped };
  }

  if (question.type === 'symptoms') {
    const noSymptoms = ['no', 'ninguno', 'ninguna', 'sin sintomas', 'no tengo', 'nada'];
    if (noSymptoms.includes(normalized)) return { ok: true, value: 'NINGUNO' };
  }

  if (question.type === 'medications') {
    const noMeds = ['no', 'ninguno', 'ninguna', 'no tomo', 'nada'];
    const unknownMeds = ['no se', 'no me acuerdo', 'no recuerdo'];
    if (noMeds.includes(normalized)) return { ok: true, value: 'NINGUNO' };
    if (unknownMeds.includes(normalized)) return { ok: true, value: 'NO SÉ' };
  }

  if (!hasUsableFreeText(trimmed)) {
    return { ok: false, reason: 'Ese mensaje no parece responder la pregunta.' };
  }

  if (question.field === 'main_concern' && normalized.length < 4) {
    return { ok: false, reason: 'Contame un poco más para que podamos ayudarte.' };
  }

  return { ok: true, value: trimmed };
}

function buildInvalidAnswerRetry(
  questionIndex: number,
  patientName: string,
  reason: string,
): string {
  const question = TRIAGE_QUESTIONS[questionIndex]!;

  return [
    `🤔 *No pude usar esa respuesta, ${patientName}.*`,
    ``,
    reason,
    ``,
    `Te repito la pregunta para seguir sin perder el orden:`,
    ``,
    `📝 *Pregunta ${questionIndex + 1} de ${TRIAGE_QUESTIONS.length}*`,
    ``,
    question.question,
  ].join('\n');
}

// ==========================================
// Motor de sesión de triaje
// ==========================================

export async function handleTriageMessage(
  supabase: SupabaseLike,
  config: { openclaw: OpenClawConfig; dryRun?: boolean },
  patientPhone: string,
  patientName: string,
  messageText: string,
): Promise<{ sent: boolean; error?: string }> {
  try {
    // 1. Buscar sesión activa
    const { data: existingSession } = await supabase
      .from('whatsapp_triage_sessions')
      .select('*')
      .eq('patient_phone', patientPhone)
      .eq('status', 'active')
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession) {
      // Continuar sesión existente
      return await continueTriageSession(
        supabase,
        config,
        existingSession as TriageSession,
        messageText,
      );
    }

    // 2. Nueva sesión — crear PRIMERO en DB, luego enviar welcome
    //    Así no perdemos la sesión si el envío de WhatsApp falla o cuelga.
    const sessionId = `triage_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    
    const { error: insertErr } = await supabase
      .from('whatsapp_triage_sessions')
      .insert({
        session_id: sessionId,
        patient_phone: patientPhone,
        patient_name: patientName,
        current_question: -1,
        answers: {},
        started_at: now,
        last_activity_at: now,
        status: 'active',
      });

    if (insertErr) {
      console.error('[Triage] Failed to create session:', insertErr.message);
      return { sent: false, error: insertErr.message };
    }

    // Enviar welcome de forma no bloqueante (no esperamos la respuesta)
    const welcomeMsg = buildHealthCheckWelcome(patientName);
    if (!config.dryRun) {
      sendMessageWithFallback(config.openclaw, {
        to: patientPhone,
        message: welcomeMsg,
        channel: 'whatsapp',
      }).catch(err => console.error('[Triage] Welcome send failed (non-blocking):', err.message));
    }

    return { sent: true };
  } catch (err) {
    return {
      sent: false,
      error: err instanceof Error ? err.message : 'Triage session error',
    };
  }
}

async function startTriageSession(
  supabase: SupabaseLike,
  config: { openclaw: OpenClawConfig; dryRun?: boolean },
  patientPhone: string,
  patientName: string,
): Promise<{ sent: boolean; error?: string }> {
  const sessionId = `triage_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const now = new Date().toISOString();

  // Guardar sesión en DB
  const { error: insertErr } = await supabase
    .from('whatsapp_triage_sessions')
    .insert({
      session_id: sessionId,
      patient_phone: patientPhone,
      patient_name: patientName,
      current_question: 0,
      answers: {},
      started_at: now,
      last_activity_at: now,
      status: 'active',
    });

  if (insertErr) {
    return { sent: false, error: `DB insert: ${insertErr.message}` };
  }

  // Enviar primera pregunta
  const { message } = buildNextQuestion(0, patientName);

  if (!config.dryRun) {
    const result = await sendMessageWithFallback(config.openclaw, {
      to: patientPhone,
      message,
      channel: 'whatsapp',
    });

    if (!result.ok) {
      return { sent: false, error: result.error ?? 'Send failed' };
    }
  }

  return { sent: true };
}

async function continueTriageSession(
  supabase: SupabaseLike,
  config: { openclaw: OpenClawConfig; dryRun?: boolean },
  session: TriageSession,
  messageText: string,
): Promise<{ sent: boolean; error?: string }> {
  const now = new Date().toISOString();
  const currentQ = session.current_question;

  // Si está en estado "confirming" (current_question === -1), verificar SÍ/NO
  if (currentQ === -1) {
    const normalized = messageText.trim().toLowerCase();
    const affirmatives = ['sí', 'si', 'dale', 'bueno', 'ok', 'vamos', 'empecemos', 'arrancar', 'empezar'];
    const negatives = ['no', 'nop', 'ahora no', 'después', 'despues', 'cancelar'];

    if (affirmatives.some(a => normalized.includes(a))) {
      // Empezar el triaje real
      await supabase
        .from('whatsapp_triage_sessions')
        .update({
          current_question: 0,
          last_activity_at: new Date().toISOString(),
        })
        .eq('session_id', session.session_id);

      const { message: firstQuestion } = buildNextQuestion(0, session.patient_name);
      if (!config.dryRun) {
        sendMessageWithFallback(config.openclaw, {
          to: session.patient_phone,
          message: firstQuestion,
          channel: 'whatsapp',
        }).catch(err => console.error('[Triage] Send first question failed (non-blocking):', err.message));
      }
      return { sent: true };
    } else if (negatives.some(n => normalized.includes(n))) {
      // Paciente dijo que NO
      const goodbyeMsg = [
        `👋 *No hay problema, ${session.patient_name}.*`,
        ``,
        `Cuando quieras hacer el chequeo de salud, solo respondé *SALUD*.`,
        ``,
        `¡Estamos acá para ayudarte! 🏥`,
      ].join('\n');

      await supabase
        .from('whatsapp_triage_sessions')
        .update({
          status: 'abandoned',
          last_activity_at: new Date().toISOString(),
        })
        .eq('session_id', session.session_id);

      if (!config.dryRun) {
        await sendMessageWithFallback(config.openclaw, {
          to: session.patient_phone,
          message: goodbyeMsg,
          channel: 'whatsapp',
        });
      }
      return { sent: true };
    } else {
      // No se entendió — reenviar welcome
      const retryMsg = [
        `🤔 *No entendí tu respuesta, ${session.patient_name}.*`,
        ``,
        `¿Querés hacer el chequeo de salud? Responde:`,
        `✅ *SÍ* — para empezar`,
        `❌ *NO* — si preferís no hacerlo ahora`,
      ].join('\n');

      if (!config.dryRun) {
        await sendMessageWithFallback(config.openclaw, {
          to: session.patient_phone,
          message: retryMsg,
          channel: 'whatsapp',
        });
      }
      return { sent: true };
    }
  }

  // Guardar respuesta actual
  const question = TRIAGE_QUESTIONS[currentQ]!;
  const validation = validateTriageAnswer(question, messageText);
  if (!validation.ok) {
    const retryMsg = buildInvalidAnswerRetry(currentQ, session.patient_name, validation.reason);

    if (!config.dryRun) {
      await sendMessageWithFallback(config.openclaw, {
        to: session.patient_phone,
        message: retryMsg,
        channel: 'whatsapp',
      });
    }

    return { sent: true };
  }

  const updatedAnswers = {
    ...session.answers,
    [question.field]: validation.value,
  };

  // Avanzar a siguiente pregunta
  const nextIndex = currentQ + 1;
  const { message, isComplete } = buildNextQuestion(nextIndex, session.patient_name);

  if (isComplete) {
    // Triaje completo — generar resumen
    const summary = buildHealthCheckSummary(session.patient_name, updatedAnswers, session.session_id);

    // Actualizar sesión como completada
    await supabase
      .from('whatsapp_triage_sessions')
      .update({
        answers: updatedAnswers,
        current_question: nextIndex,
        last_activity_at: now,
        status: 'completed',
      })
      .eq('session_id', session.session_id);

    // Guardar resumen en paciente (si hay user_id vinculado al teléfono)
    await persistTriageResult(supabase, session, updatedAnswers);

    // 🧠 Procesar con IA para estructurar datos clínicos (fire-and-forget)
    const apiKey = process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY'] || '';
    if (apiKey) {
      processTriageWithAI(updatedAnswers, apiKey)
        .then(async (aiResult) => {
          await supabase
            .from('patient_triage_results')
            .update({ 
              ai_processed: true,
              ai_chief_complaint: aiResult.chiefComplaint,
              ai_clinical_narrative: aiResult.clinicalNarrative,
              ai_severity: aiResult.severity,
              ai_safety_flags: aiResult.safetyFlags,
              ai_covered_areas: aiResult.coveredAreas,
              ai_missing_areas: aiResult.missingAreas,
              ai_recommendations: aiResult.recommendations,
            })
            .eq('session_id', session.session_id);
          console.log('[Triage] AI processing completed for', session.session_id);
        })
        .catch(err => console.error('[Triage] AI processing failed:', err.message));
    }

    if (!config.dryRun) {
      // Primero confirmar que está procesando
      await sendMessageWithFallback(config.openclaw, {
        to: session.patient_phone,
        message,
        channel: 'whatsapp',
      });

      // Pequeña pausa para simular "procesando..."
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Enviar resumen
      const result = await sendMessageWithFallback(config.openclaw, {
        to: session.patient_phone,
        message: summary,
        channel: 'whatsapp',
      });

      if (!result.ok) {
        return { sent: false, error: result.error ?? 'Summary send failed' };
      }
    }

    return { sent: true };
  }

  // Todavía hay preguntas — enviar siguiente
  await supabase
    .from('whatsapp_triage_sessions')
    .update({
      answers: updatedAnswers,
      current_question: nextIndex,
      last_activity_at: now,
    })
    .eq('session_id', session.session_id);

  if (!config.dryRun) {
    sendMessageWithFallback(config.openclaw, {
      to: session.patient_phone,
      message,
      channel: 'whatsapp',
    }).catch(err => console.error('[Triage] Send next question failed (non-blocking):', err.message));
  }

  return { sent: true };
}

/**
 * Persiste el resultado del triaje en la tabla de pacientes y en anamnesis.
 */
async function persistTriageResult(
  supabase: SupabaseLike,
  session: TriageSession,
  answers: Record<string, string>,
): Promise<void> {
  try {
    // Buscar paciente por teléfono
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', session.patient_phone)
      .maybeSingle();

    const patientId = profile?.id ?? null;

    // Guardar en tabla de triajes/anamnesis simplificada
    await supabase
      .from('patient_triage_results')
      .insert({
        patient_id: patientId,
        patient_phone: session.patient_phone,
        patient_name: session.patient_name,
        session_id: session.session_id,
        answers,
        alerts_detected: extractAlerts(answers),
        source: 'whatsapp',
        created_at: new Date().toISOString(),
      });
  } catch (err) {
    // No crítico — el triaje ya se completó, esto es metadata
    console.error('[Triage] Failed to persist result:', err);
  }
}

function extractAlerts(answers: Record<string, string>): string[] {
  const alerts: string[] = [];
  const mainConcern = (answers.main_concern || answers.q2_motivo || '').toLowerCase();
  const symptoms = (answers.current_symptoms || answers.q3_sintomas || '').toLowerCase();
  const painLevel = (answers.pain_level || answers.q7_dolor || '').toLowerCase();

  const redFlags = [
    'dolor en el pecho', 'dolor de pecho', 'falta de aire',
    'no puedo respirar', 'desmayo', 'convulsión', 'sangrado',
  ];

  for (const flag of redFlags) {
    if (mainConcern.includes(flag) || symptoms.includes(flag)) {
      alerts.push(`RED:${flag}`);
      break;
    }
  }

  if (painLevel.includes('bastante') || painLevel.includes('mucho')) {
    alerts.push('YELLOW:pain_significant');
  }

  return alerts;
}

/**
 * Limpia sesiones abandonadas (más de 1 hora sin actividad).
 */
export async function cleanupAbandonedSessions(
  supabase: SupabaseLike,
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('whatsapp_triage_sessions')
    .update({ status: 'abandoned' })
    .eq('status', 'active')
    .lt('last_activity_at', oneHourAgo)
    .select('id');

  if (error) {
    console.error('[Triage] Cleanup error:', error.message);
    return 0;
  }

  return data?.length ?? 0;
}
