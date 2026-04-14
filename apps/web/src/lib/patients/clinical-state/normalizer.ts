/**
 * Normalizer
 *
 * Entry point that converts raw inputs from any source
 * (UI form, voice extraction, DB load, doctor review)
 * into canonical field updates and runs them through the merge engine.
 *
 * Architecture flow:
 *   Raw input → Normalizer → Merge Engine → Updated ClinicalCaseState
 *
 * The normalizer is responsible for:
 * 1. Mapping raw form field IDs to canonical field keys
 * 2. Detecting meta-conversational content before merge
 * 3. Running the batch merge
 * 4. Recomputing integrity scores
 * 5. Updating planner indices (missing, conflicted, locked)
 */
import type {
  ClinicalCaseState,
  ConversationEvent,
  IncomingDatum,
  NormalizeInput,
  NormalizerResult,
  SourceType,
  SegmentKey,
  WorkflowType,
} from './types';
import { createEmptyField, flattenAllFields } from './canonical-field';
import { batchMerge } from './merge-engine';
import { recomputeIntegrity, createFreshIntegrity } from './integrity';
import { isMetaConversational } from './meta-filter';
import { computeTriage } from './triage';

// ─── Form Field → Canonical Key Mapping ────────────────────────────────

/**
 * Maps raw UI form field IDs (from PsychiatryIntakePage) to canonical keys.
 * This is the translation layer between the UI's vocabulary and the
 * clinical state's vocabulary.
 */
const FORM_FIELD_MAP: Record<string, string> = {
  // Identity
  first_name: 'identity.firstName',
  last_name: 'identity.lastName',
  full_name: 'identity.fullName',
  age: 'identity.age',
  gender: 'identity.gender',
  document_id: 'identity.documentId',

  // Intake context
  consultation_type: 'intakeContext.workflowType',
  chief_complaint: 'intakeContext.chiefComplaint',
  consultation_reason: 'intakeContext.consultationReason',
  motivo_consulta: 'intakeContext.chiefComplaint',
  tipo_atencion: 'intakeContext.workflowType',
  continuity_request: 'intakeContext.continuityRequest',
  renewal_request: 'intakeContext.renewalRequest',
  relato_sintomas: 'intakeContext.chiefComplaint',

  // Medication
  has_medication: 'medications.hasCurrentMedication',
  current_medications: 'medications.currentMedicationNameText',
  medicacion_actual: 'medications.currentMedicationNameText',
  medication_name: 'medications.currentMedicationNameText',
  dose: 'medications.currentMedicationDoseText',
  tratamiento_actual: 'medications.hasCurrentMedication',
  medicacion_continuidad: 'medications.currentMedicationNameText',
  dosis_continuidad: 'medications.currentMedicationDoseText',
  dosis_actual: 'medications.currentMedicationDoseText',
  prescriptor_actual: 'medications.currentMedicationPrescriber',
  prescriptor_continuidad: 'medications.currentMedicationPrescriber',
  dias_medicacion_restante: 'medications.currentMedicationDaysRemaining',
  adherencia: 'medications.currentMedicationAdherence',
  respuesta_previa_estimulantes: 'medications.currentMedicationResponse',

  // Symptoms — canonical keys
  insomnia: 'symptoms.insomnia',
  appetite_change: 'symptoms.appetiteChange',
  palpitations: 'symptoms.palpitations',
  panic_episodes: 'symptoms.panicEpisodes',
  chest_pain: 'symptoms.chestPain',
  self_harm: 'symptoms.selfHarmIdeation',
  residual_symptoms: 'symptoms.residualSymptoms',
  // Symptoms — psychiatric wizard field IDs (seguridad_clinica + monitoreo_tratamiento)
  insomnio_actual: 'symptoms.insomnia',
  palpitaciones: 'symptoms.palpitations',
  dolor_pecho: 'symptoms.chestPain',
  ideas_autolesion: 'symptoms.selfHarmIdeation',
  crisis_panico: 'symptoms.panicEpisodes',
  apetito: 'symptoms.appetiteChange',
  sintomas_alarma_continuidad: 'symptoms.selfHarmIdeation',
  // Symptoms — general anamnesis (cross-specialty, GI side effects)
  dolor_abdominal: 'symptoms.abdominalPain',
  acidez: 'symptoms.heartburn',
  cambio_habito_intestinal: 'symptoms.bowelHabitChange',

  // Functional impact
  work_impact: 'functionalImpact.workImpact',
  study_impact: 'functionalImpact.studyImpact',
  home_impact: 'functionalImpact.homeImpact',
  concentration: 'functionalImpact.concentrationDifficulty',
  treatment_goals: 'functionalImpact.treatmentGoals',
  impacto_estudio_trabajo: 'functionalImpact.workImpact',
  objetivos_tratamiento: 'functionalImpact.treatmentGoals',

  // History / review
  diagnostico_tdah_confirmado: 'history.diagnosisConfirmed',
  diagnostico_texto: 'history.diagnosisSummary',
  ocupacion_actual: 'history.occupation',
  rutina_principal: 'history.routineSummary',
  antecedentes_relevantes: 'history.psychiatricHistory',
  contraindicaciones: 'history.contraindications',
  comentarios_monitoreo: 'review.monitoringNotes',
  comentarios_finales: 'review.finalComments',
};

export function resolveCanonicalKey(rawKey: string): string {
  return FORM_FIELD_MAP[rawKey] ?? rawKey;
}

/**
 * Reverse resolve a canonical key to its raw form field key.
 */
export function reverseCanonicalKey(canonicalKey: string): string {
  const entry = Object.entries(FORM_FIELD_MAP).find(([, value]) => value === canonicalKey);
  return entry ? entry[0] : canonicalKey;
}

// ─── State Factory ─────────────────────────────────────────────────────

/**
 * Create a fresh, empty ClinicalCaseState.
 */
export function createEmptyState(
  caseId: string,
  patientId: string,
  workflowType: WorkflowType,
): ClinicalCaseState {
  const now = new Date().toISOString();

  return {
    caseId,
    patientId,

    workflow: {
      type: workflowType,
      vertical: 'psychiatry_general',
      intent: 'evaluation',
      currentSegment: 'identity',
      completedSegments: [],
      openedAt: now,
      updatedAt: now,
    },

    identity: {
      firstName: createEmptyField('identity.firstName'),
      lastName: createEmptyField('identity.lastName'),
      fullName: createEmptyField('identity.fullName'),
      age: createEmptyField('identity.age'),
      gender: createEmptyField('identity.gender'),
      documentId: createEmptyField('identity.documentId'),
    },

    intakeContext: {
      workflowType: createEmptyField('intakeContext.workflowType'),
      chiefComplaint: createEmptyField('intakeContext.chiefComplaint'),
      consultationReason: createEmptyField('intakeContext.consultationReason'),
      continuityRequest: createEmptyField('intakeContext.continuityRequest'),
      renewalRequest: createEmptyField('intakeContext.renewalRequest'),
    },

    medications: {
      currentMedications: createEmptyField('medications.currentMedications'),
      hasCurrentMedication: createEmptyField('medications.hasCurrentMedication'),
      currentMedicationNameText: createEmptyField('medications.currentMedicationNameText'),
      currentMedicationDoseText: createEmptyField('medications.currentMedicationDoseText'),
      currentMedicationPrescriber: createEmptyField('medications.currentMedicationPrescriber'),
      currentMedicationDaysRemaining: createEmptyField('medications.currentMedicationDaysRemaining'),
      currentMedicationAdherence: createEmptyField('medications.currentMedicationAdherence'),
      currentMedicationResponse: createEmptyField('medications.currentMedicationResponse'),
    },

    symptoms: {
      insomnia: createEmptyField('symptoms.insomnia'),
      appetiteChange: createEmptyField('symptoms.appetiteChange'),
      palpitations: createEmptyField('symptoms.palpitations'),
      panicEpisodes: createEmptyField('symptoms.panicEpisodes'),
      chestPain: createEmptyField('symptoms.chestPain'),
      selfHarmIdeation: createEmptyField('symptoms.selfHarmIdeation'),
      residualSymptoms: createEmptyField('symptoms.residualSymptoms'),
      
      // New Sleep Quality metrics
      sleepHours: createEmptyField('symptoms.sleepHours'),
      nightsPerWeek: createEmptyField('symptoms.nightsPerWeek'),
      daytimeImpact: createEmptyField('symptoms.daytimeImpact'),
      conciliacionDifficulty: createEmptyField('symptoms.conciliacionDifficulty'),
      mantenimientoDifficulty: createEmptyField('symptoms.mantenimientoDifficulty'),

      // Cross-specialty general symptoms
      abdominalPain: createEmptyField('symptoms.abdominalPain'),
      heartburn: createEmptyField('symptoms.heartburn'),
      bowelHabitChange: createEmptyField('symptoms.bowelHabitChange'),
    },

    functionalImpact: {
      workImpact: createEmptyField('functionalImpact.workImpact'),
      studyImpact: createEmptyField('functionalImpact.studyImpact'),
      homeImpact: createEmptyField('functionalImpact.homeImpact'),
      concentrationDifficulty: createEmptyField('functionalImpact.concentrationDifficulty'),
      treatmentGoals: createEmptyField('functionalImpact.treatmentGoals'),
    },

    history: {
      diagnosisConfirmed: createEmptyField('history.diagnosisConfirmed'),
      diagnosisSummary: createEmptyField('history.diagnosisSummary'),
      occupation: createEmptyField('history.occupation'),
      routineSummary: createEmptyField('history.routineSummary'),
      previousTreatmentResponse: createEmptyField('history.previousTreatmentResponse'),
      psychiatricHistory: createEmptyField('history.psychiatricHistory'),
      contraindications: createEmptyField('history.contraindications'),
    },

    review: {
      monitoringNotes: createEmptyField('review.monitoringNotes'),
      finalComments: createEmptyField('review.finalComments'),
    },

    integrity: createFreshIntegrity(),

    planner: {
      lockedFieldKeys: [],
      missingFieldKeys: [],
      conflictedFieldKeys: [],
      pendingConfirmationKeys: [],
      nextRecommendedQuestions: [],
      doNotAskKeys: [],
    },

    conversation: {
      askedQuestionIds: [],
      answeredQuestionIds: [],
    },

    triage: {
      priority: 'routine',
      status: 'pending',
      riskOfInterruption: 'low',
      requiresSameDayAction: false,
      reasons: [],
      mandate: '',
      suggestedAction: '',
      references: [],
    },

    audit: {
      events: [],
    },
  };
}

// ─── Normalize ─────────────────────────────────────────────────────────

/**
 * Normalize raw input from any source into the canonical state.
 *
 * This is the main entry point. Call this when:
 * - The patient fills a form field
 * - Voice extraction returns structured data
 * - Loading from DB on page load
 * - Doctor reviews and corrects a field
 */
export function normalize(
  currentState: ClinicalCaseState,
  input: NormalizeInput,
): NormalizerResult {
  // Deep clone to avoid mutation
  const state: ClinicalCaseState = JSON.parse(JSON.stringify(currentState));
  const events: ConversationEvent[] = [];
  let metaDetected = false;

  // 1. Map raw field keys and values to canonical keys
  const normalizedData: IncomingDatum[] = input.data.map((datum) => {
    let finalValue = datum.value;
    const finalKey = resolveCanonicalKey(datum.fieldKey);

    // Map the UI form values to the WorkflowType enum
    if (finalKey === 'intakeContext.workflowType' && typeof finalValue === 'string') {
      if (finalValue === 'primera_consulta') finalValue = 'psychiatry_first_visit';
      else if (finalValue === 'continuidad') finalValue = 'psychiatry_continuity';
      else if (finalValue === 'revision_urgente') finalValue = 'psychiatric_urgency';
    }

    if (finalKey === 'medications.currentMedicationDaysRemaining') {
      finalValue = normalizeDaysRemaining(finalValue);
    }

    return {
      ...datum,
      fieldKey: finalKey,
      value: finalValue,
    };
  });

  // 2. Pre-filter: detect meta-conversational content
  const clinicalData: IncomingDatum[] = [];
  for (const datum of normalizedData) {
    if (datum.rawText && isMetaConversational(datum.rawText)) {
      metaDetected = true;
      state.integrity.metaUtteranceCount++;
      events.push({
        id: `meta_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        type: 'meta_conversation_detected',
        timestamp: new Date().toISOString(),
        segment: input.segment,
        fieldKey: datum.fieldKey,
        payload: { blockedText: datum.rawText },
      });
      // Don't add to clinical data — blocked
    } else {
      clinicalData.push(datum);
    }
  }

  // 3. Build field map from current state
  const fieldMap = buildFieldMap(state);

  // 4. Run batch merge
  const mergeResult = batchMerge(fieldMap, clinicalData);
  events.push(...mergeResult.allEvents);

  // 5. Write merged fields back to state
  applyFieldMap(state, fieldMap);

  // 6. Update workflow segment
  state.workflow.currentSegment = input.segment;
  state.workflow.updatedAt = new Date().toISOString();

  // 7. Recompute planner indices
  const allFields = flattenAllFields(state);

  state.planner.lockedFieldKeys = allFields
    .filter((f) => f.locked)
    .map((f) => f.key);

  state.planner.missingFieldKeys = allFields
    .filter((f) => f.status === 'missing' || f.value == null)
    .map((f) => f.key);

  state.planner.conflictedFieldKeys = allFields
    .filter((f) => f.status === 'conflicted')
    .map((f) => f.key);

  state.planner.pendingConfirmationKeys = allFields
    .filter((f) => f.needsConfirmation)
    .map((f) => f.key);

  // 8. Recompute integrity
  state.integrity = recomputeIntegrity(state);

  // 9. Recompute triage and clinical priority
  state.triage = computeTriage(state);

  // 10. Append events to audit log
  state.audit.events.push(...events);

  return {
    state,
    updatedFieldKeys: mergeResult.updatedFieldKeys,
    conflictedFieldKeys: mergeResult.conflictedFieldKeys,
    metaConversationDetected: metaDetected,
    events,
  };
}

// ─── Convenience: Normalize from UI form ───────────────────────────────

/**
 * Convenience wrapper for normalizing raw form data (e.g. from
 * PsychiatryIntakePage's currentStepData).
 */
export function normalizeFormData(
  currentState: ClinicalCaseState,
  formData: Record<string, unknown>,
  segment: SegmentKey,
  options?: {
    explicitConfirmation?: boolean;
    source?: SourceType;
    confidence?: 'low' | 'medium' | 'high';
  },
): NormalizerResult {
  const now = new Date().toISOString();
  const explicitConfirmation = options?.explicitConfirmation ?? false;
  const source = options?.source ?? 'ui_form';
  const confidence = options?.confidence ?? 'high';

  const data: IncomingDatum[] = Object.entries(formData)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      fieldKey: key,
      value,
      source,
      sourceSegment: segment,
      confidence,
      timestamp: now,
      explicitConfirmation,
    }));

  return normalize(currentState, {
    caseId: currentState.caseId,
    patientId: currentState.patientId,
    workflowType: currentState.workflow.type,
    segment,
    data,
  });
}

/**
 * Convenience wrapper for normalizing voice extraction results.
 */
export function normalizeVoiceExtraction(
  currentState: ClinicalCaseState,
  extractedFields: Record<string, unknown>,
  rawTranscript: string,
  segment: SegmentKey,
): NormalizerResult {
  const now = new Date().toISOString();

  const data: IncomingDatum[] = Object.entries(extractedFields)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      fieldKey: key,
      value,
      source: 'voice_extraction' as SourceType,
      sourceSegment: segment,
      confidence: 'medium' as const, // voice extraction = medium confidence
      rawText: rawTranscript,
      timestamp: now,
      explicitConfirmation: false,
    }));

  return normalize(currentState, {
    caseId: currentState.caseId,
    patientId: currentState.patientId,
    workflowType: currentState.workflow.type,
    segment,
    data,
  });
}

// ─── Internal: Field Map ↔ State ───────────────────────────────────────

import type { CanonicalField } from './types';

type SectionWithFields = Record<string, CanonicalField<unknown>>;

function buildFieldMap(state: ClinicalCaseState): Map<string, CanonicalField<unknown>> {
  const map = new Map<string, CanonicalField<unknown>>();

  const sections: Record<string, SectionWithFields | undefined> = {
    identity: state.identity as unknown as SectionWithFields,
    intakeContext: state.intakeContext as unknown as SectionWithFields,
    medications: state.medications as unknown as SectionWithFields,
    symptoms: state.symptoms as unknown as SectionWithFields,
    functionalImpact: state.functionalImpact as unknown as SectionWithFields,
    history: state.history as unknown as SectionWithFields,
    review: state.review as unknown as SectionWithFields,
  };

  for (const [sectionName, section] of Object.entries(sections)) {
    if (!section || typeof section !== 'object') continue;

    for (const [fieldName, field] of Object.entries(section)) {
      if (field && typeof field === 'object' && 'key' in field) {
        const canonicalField = field as CanonicalField<unknown>;
        // Ensure key is set correctly
        if (!canonicalField.key) {
          canonicalField.key = `${sectionName}.${fieldName}`;
        }
        map.set(canonicalField.key, canonicalField);
      }
    }
  }

  return map;
}

function applyFieldMap(
  state: ClinicalCaseState,
  fieldMap: Map<string, CanonicalField<unknown>>,
): void {
  for (const [key, field] of fieldMap) {
    const [sectionName, fieldName] = key.split('.');
    if (!sectionName || !fieldName) continue;

    const stateRecord = state as unknown as Record<string, Record<string, unknown> | undefined>;
    let section = stateRecord[sectionName];
    if (!section || typeof section !== 'object') {
      section = {};
      stateRecord[sectionName] = section;
    }

    section[fieldName] = field;
  }
}

function normalizeDaysRemaining(value: unknown): unknown {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }

  if (trimmed === '0') return 0;
  if (trimmed === '1-3') return 2;
  if (trimmed === '4-7') return 5;
  if (trimmed === '7+') return 8;

  const numericMatch = trimmed.match(/\d+/);
  if (numericMatch) {
    const parsed = Number(numericMatch[0]);
    if (Number.isFinite(parsed)) return parsed;
  }

  return value;
}
