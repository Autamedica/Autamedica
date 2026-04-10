/**
 * Question Planner
 *
 * Reads the ClinicalCaseState and determines what questions
 * the voice bot or form should present next.
 *
 * Core rule: The planner NEVER improvises.
 * It reads the canonical state, checks field statuses,
 * and emits only what's needed.
 *
 * - confirmed+locked → do_not_ask
 * - missing          → collect
 * - conflicted       → resolve_conflict
 * - low_confidence   → confirm (not re-ask from scratch)
 * - already asked    → skip (unless conflicted)
 */
import type {
  CanonicalField,
  ClinicalCaseState,
  PlannerOutput,
  PlannerQuestion,
  QuestionIntent,
  SegmentKey,
  UUID,
} from './types';
import { flattenAllFields } from './canonical-field';

// ─── Field → Question Template Mapping ─────────────────────────────────

interface QuestionTemplate {
  fieldKey: string;
  segment: SegmentKey;
  collectPrompt: string;
  confirmPrompt: (currentValue: unknown) => string;
  conflictPrompt: (currentValue: unknown, reason?: string) => string;
  clinicalPriority: number; // 1 = critical safety, 10 = nice to have
}

/**
 * Registry of question templates per field.
 * This separates the WHAT from the HOW — the planner decides WHAT to ask,
 * the template decides HOW to phrase it.
 */
const QUESTION_TEMPLATES: QuestionTemplate[] = [
  // ── Identity ──
  {
    fieldKey: 'identity.firstName',
    segment: 'identity',
    collectPrompt: '¿Cuál es tu nombre?',
    confirmPrompt: (v) => `¿Tu nombre es ${v}? ¿Es correcto?`,
    conflictPrompt: (v, r) => `Tengo registrado "${v}" como tu nombre pero hay una discrepancia${r ? `: ${r}` : ''}. ¿Podés confirmarlo?`,
    clinicalPriority: 2,
  },
  // ── Intake Context ──
  {
    fieldKey: 'intakeContext.chiefComplaint',
    segment: 'intake_context',
    collectPrompt: '¿Cuál es el motivo principal de tu consulta hoy?',
    confirmPrompt: (v) => `Entiendo que consultás por "${v}". ¿Es correcto?`,
    conflictPrompt: (v, r) => `Sobre tu motivo de consulta: antes mencionaste "${v}"${r ? `, pero ${r}` : ''}. ¿Podés aclarar cuál es tu motivo principal?`,
    clinicalPriority: 1,
  },
  {
    fieldKey: 'intakeContext.consultationReason',
    segment: 'intake_context',
    collectPrompt: '¿Podés contarme un poco más sobre la razón de esta consulta?',
    confirmPrompt: (v) => `Registré que la razón es: "${v}". ¿Querés agregar algo?`,
    conflictPrompt: (v) => `Sobre la razón de consulta, tengo: "${v}". ¿Es esto correcto?`,
    clinicalPriority: 2,
  },
  // ── Medication ──
  {
    fieldKey: 'medications.hasCurrentMedication',
    segment: 'current_medication',
    collectPrompt: '¿Estás tomando alguna medicación actualmente?',
    confirmPrompt: (v) => v ? 'Me indicaste que sí tomás medicación. ¿Sigue siendo así?' : 'Me indicaste que no tomás medicación actualmente. ¿Es correcto?',
    conflictPrompt: (v) => `Hay información contradictoria sobre si tomás medicación (${v}). ¿Podés confirmarlo?`,
    clinicalPriority: 1,
  },
  {
    fieldKey: 'medications.currentMedications',
    segment: 'current_medication',
    collectPrompt: '¿Qué medicación estás tomando? Incluí nombre, dosis y frecuencia si es posible.',
    confirmPrompt: (v) => {
      const meds = Array.isArray(v) ? v : [];
      if (meds.length === 0) return '¿Podés contarme qué medicación tomás?';
      return `Tengo registrada tu medicación. ¿Querés revisar si está todo correcto?`;
    },
    conflictPrompt: () => 'Hay información contradictoria sobre tu medicación. ¿Podés detallarla nuevamente?',
    clinicalPriority: 1,
  },
  // ── Symptoms ──
  {
    fieldKey: 'symptoms.insomnia',
    segment: 'symptoms',
    collectPrompt: '¿Tenés dificultades para dormir o insomnio?',
    confirmPrompt: (v) => v ? '¿El insomnio sigue presente?' : 'Me indicaste que no tenés insomnio. ¿Sigue siendo así?',
    conflictPrompt: () => 'Hay información contradictoria sobre si tenés insomnio. ¿Podés aclarar?',
    clinicalPriority: 3,
  },
  {
    fieldKey: 'symptoms.appetiteChange',
    segment: 'symptoms',
    collectPrompt: '¿Notaste cambios en tu apetito últimamente?',
    confirmPrompt: (v) => `Indicaste: "${v}" sobre tu apetito. ¿Sigue igual?`,
    conflictPrompt: (v) => `Sobre tu apetito tengo "${v}" pero hay discrepancia. ¿Podés aclarar?`,
    clinicalPriority: 4,
  },
  {
    fieldKey: 'symptoms.palpitations',
    segment: 'symptoms',
    collectPrompt: '¿Experimentaste palpitaciones o latidos irregulares?',
    confirmPrompt: (v) => v ? '¿Seguís teniendo palpitaciones?' : '¿Siguen sin presentarse las palpitaciones?',
    conflictPrompt: () => 'Hay información contradictoria sobre palpitaciones. ¿Podés aclarar?',
    clinicalPriority: 2,
  },
  // ── Safety (highest clinical priority) ──
  {
    fieldKey: 'symptoms.selfHarmIdeation',
    segment: 'safety',
    collectPrompt: 'Esta es una pregunta importante que le hacemos a todos los pacientes: ¿has tenido pensamientos de hacerte daño o de que la vida no vale la pena?',
    confirmPrompt: (v) => v
      ? 'Indicaste previamente pensamientos de este tipo. ¿Siguen presentes?'
      : 'Indicaste que no tenés pensamientos de hacerte daño. ¿Sigue siendo así?',
    conflictPrompt: () => 'Necesitamos aclarar esta información por tu seguridad. ¿Tenés pensamientos de hacerte daño?',
    clinicalPriority: 1,
  },
  // ── Functional Impact ──
  {
    fieldKey: 'functionalImpact.workImpact',
    segment: 'functional_impact',
    collectPrompt: '¿Cómo está afectando tu situación actual a tu trabajo?',
    confirmPrompt: (v) => `Registré que el impacto laboral es: "${v}". ¿Querés modificar algo?`,
    conflictPrompt: (v) => `Sobre el impacto laboral tengo "${v}" pero hay discrepancia. ¿Podés aclarar?`,
    clinicalPriority: 5,
  },
  {
    fieldKey: 'functionalImpact.concentrationDifficulty',
    segment: 'functional_impact',
    collectPrompt: '¿Tenés dificultades de concentración?',
    confirmPrompt: (v) => `Indicaste sobre concentración: "${v}". ¿Sigue igual?`,
    conflictPrompt: (v) => `Sobre concentración tengo "${v}" pero hay discrepancia. ¿Podés aclarar?`,
    clinicalPriority: 4,
  },
  {
    fieldKey: 'functionalImpact.treatmentGoals',
    segment: 'functional_impact',
    collectPrompt: '¿Qué esperarías lograr con el tratamiento?',
    confirmPrompt: (v) => `Registré como objetivo: "${v}". ¿Es correcto?`,
    conflictPrompt: (v) => `Sobre tus objetivos terapéuticos tengo "${v}" pero hay discrepancia. ¿Podés aclarar?`,
    clinicalPriority: 6,
  },
];

// ─── Planner Core ──────────────────────────────────────────────────────

/**
 * Plan which questions to ask next based on the canonical state.
 *
 * The planner:
 * 1. Scans all fields for their status
 * 2. Filters to the current segment (or all if not specified)
 * 3. Determines the intent for each field
 * 4. Generates concrete question prompts
 * 5. Sorts by clinical priority
 */
export function planQuestions(
  state: ClinicalCaseState,
  options?: {
    /** Only plan questions for this segment */
    segmentFilter?: SegmentKey;
    /** Maximum questions to return */
    maxQuestions?: number;
  },
): PlannerOutput {
  const allFields = flattenAllFields(state);
  const doNotAskKeys = [...state.planner.doNotAskKeys];
  const skippedBecauseKnown: string[] = [];
  const blockedBecauseConflict: string[] = [];
  const questions: PlannerQuestion[] = [];

  for (const template of QUESTION_TEMPLATES) {
    // Segment filter
    if (options?.segmentFilter && template.segment !== options.segmentFilter) {
      continue;
    }

    // Find the field in the canonical state
    const field = allFields.find((f) => f.key === template.fieldKey);

    // Determine intent
    const intent = determineIntent(field, state, template.fieldKey);

    if (intent === 'do_not_ask') {
      doNotAskKeys.push(template.fieldKey);
      if (field?.status === 'confirmed') {
        skippedBecauseKnown.push(template.fieldKey);
      }
      continue;
    }

    if (intent === 'skip') {
      continue;
    }

    if (intent === 'resolve_conflict') {
      blockedBecauseConflict.push(template.fieldKey);
    }

    // Generate the appropriate prompt
    const prompt = generatePrompt(template, intent, field);

    questions.push({
      id: generateQuestionId(),
      fieldKey: template.fieldKey,
      intent,
      prompt,
      reason: generateReason(intent, field, template.fieldKey),
    });
  }

  // Sort by clinical priority (lower number = higher priority)
  questions.sort((a, b) => {
    const tA = QUESTION_TEMPLATES.find((t) => t.fieldKey === a.fieldKey);
    const tB = QUESTION_TEMPLATES.find((t) => t.fieldKey === b.fieldKey);
    return (tA?.clinicalPriority ?? 10) - (tB?.clinicalPriority ?? 10);
  });

  // Limit
  const maxQ = options?.maxQuestions ?? 5;
  const limited = questions.slice(0, maxQ);

  return {
    questions: limited,
    doNotAskKeys,
    skippedBecauseKnown,
    blockedBecauseConflict,
  };
}

// ─── Intent Determination ──────────────────────────────────────────────

function determineIntent(
  field: CanonicalField<unknown> | undefined,
  state: ClinicalCaseState,
  fieldKey: string,
): QuestionIntent {
  // Already in doNotAsk list
  if (state.planner.doNotAskKeys.includes(fieldKey)) {
    return 'do_not_ask';
  }

  // No field data at all → collect
  if (!field) return 'collect';

  // Field is confirmed and locked → don't ask
  if (field.locked && field.status === 'confirmed') {
    return 'do_not_ask';
  }

  // Conflicted → must resolve
  if (field.status === 'conflicted') {
    return 'resolve_conflict';
  }

  // Missing → collect
  if (field.status === 'missing' || field.value == null) {
    return 'collect';
  }

  // Low confidence → confirm (not re-ask from scratch)
  if (field.confidence === 'low' || field.needsConfirmation) {
    return 'confirm';
  }

  // Draft with medium confidence → soft confirm
  if (field.status === 'draft' && field.confidence === 'medium') {
    return 'confirm';
  }

  // Everything else → confirmed enough, skip
  return 'do_not_ask';
}

function generatePrompt(
  template: QuestionTemplate,
  intent: QuestionIntent,
  field?: CanonicalField<unknown>,
): string {
  switch (intent) {
    case 'collect':
      return template.collectPrompt;
    case 'confirm':
      return template.confirmPrompt(field?.value);
    case 'resolve_conflict':
      return template.conflictPrompt(field?.value, field?.conflictReason);
    default:
      return template.collectPrompt;
  }
}

function generateReason(
  intent: QuestionIntent,
  field?: CanonicalField<unknown>,
  fieldKey?: string,
): string {
  switch (intent) {
    case 'collect':
      return `Campo "${fieldKey}" no tiene datos. Necesita recolección.`;
    case 'confirm':
      return `Campo "${fieldKey}" tiene valor con confianza ${field?.confidence ?? 'unknown'}. Necesita confirmación.`;
    case 'resolve_conflict':
      return `Campo "${fieldKey}" tiene conflicto: ${field?.conflictReason ?? 'valores contradictorios'}. Necesita resolución del paciente.`;
    default:
      return `Campo "${fieldKey}" estado: ${field?.status ?? 'unknown'}`;
  }
}

// ─── Utils ─────────────────────────────────────────────────────────────

let questionCounter = 0;

function generateQuestionId(): UUID {
  questionCounter++;
  return `q_${Date.now().toString(36)}_${questionCounter.toString(36).padStart(4, '0')}`;
}
