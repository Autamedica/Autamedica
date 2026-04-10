/**
 * Prompt Snapshot Builder
 *
 * Builds the distilled "radiography" of the clinical case that the LLM sees.
 *
 * The LLM should NEVER see:
 * - Raw React state
 * - Full transcript
 * - Internal field metadata
 *
 * It should see:
 * - What is known (confirmed facts)
 * - What is missing
 * - What is conflicted
 * - What NOT to ask again
 * - Current workflow context
 * - Integrity status
 */
import type {
  ClinicalCaseState,
  PromptCaseSnapshot,
  CanonicalField,
} from './types';
import { flattenAllFields } from './canonical-field';

// ─── Public API ────────────────────────────────────────────────────────

/**
 * Build a snapshot of the clinical case for the LLM prompt.
 * This is the ONLY interface between the canonical state and the LLM.
 */
export function buildPromptSnapshot(state: ClinicalCaseState): PromptCaseSnapshot {
  const allFields = flattenAllFields(state);
  const doNotAskSet = new Set(state.planner?.doNotAskKeys ?? []);

  const formatFact = (f: CanonicalField<unknown>) => ({
    fieldKey: f.key,
    value: f.value,
    originSource: f.provenance[0]?.source ?? 'system_inference',
    latestSource: f.provenance[f.provenance.length - 1]?.source ?? 'system_inference',
    confidence: f.confidence || 'medium',
  });

  const confirmedFacts = allFields
    .filter((f) => f.value !== null && f.value !== undefined && f.status === 'confirmed')
    .map(formatFact);

  const derivedFacts = allFields
    .filter((f) => f.value !== null && f.value !== undefined && f.status === 'derived')
    .map(formatFact);

  const draftFacts = allFields
    .filter((f) => f.value !== null && f.value !== undefined && f.status === 'draft')
    .map(formatFact);

  const isMissing = (f: CanonicalField<unknown>) => f.status === 'missing' || f.value == null;
  
  // For now, relevant if not explicitly excluded
  const isRelevantToCurrentWorkflow = (f: CanonicalField<unknown>, wt: string) => true;

  const viableMissingFields = allFields.filter(
    (f) =>
      isMissing(f) &&
      !f.locked &&
      !doNotAskSet.has(f.key) &&
      f.status !== 'conflicted' &&
      f.status !== 'invalid' &&
      isRelevantToCurrentWorkflow(f, state.workflow.type)
  );

  const safetyKeys = new Set(['selfHarmIdeation', 'chestPain', 'palpitations', 'panicEpisodes']);
  
  const safetyCriticalFacts = viableMissingFields
    .filter(f => safetyKeys.has(f.key))
    .map(f => f.key);
    
  const priorityMissingFacts = viableMissingFields
    .filter(f => !safetyKeys.has(f.key))
    .map(f => f.key);

  return {
    confirmedFacts,
    derivedFacts,
    draftFacts,

    priorityMissingFacts,
    safetyCriticalFacts,
    nextBestQuestionKeys: state.planner?.nextRecommendedQuestions ?? [],

    conflictedFacts: allFields
      .filter((f) => f.status === 'conflicted')
      .map((f) => f.key),

    lockedFacts: allFields
      .filter((f) => f.locked)
      .map((f) => f.key),

    doNotAskFacts: state.planner?.doNotAskKeys ?? [],

    workflowType: state.workflow.type,
    currentSegment: state.workflow.currentSegment,
    integrityStatus: state.integrity.stateSyncStatus,
  };
}

// ─── Human-Readable Snapshot (for system instructions) ─────────────────

/**
 * Build a human-readable text version of the snapshot for embedding
 * directly into Gemini system instructions.
 *
 * This is what the voice bot actually "reads" before speaking.
 */
export function buildPromptText(state: ClinicalCaseState): string {
  const snapshot = buildPromptSnapshot(state);
  const lines: string[] = [];

  lines.push('=== ESTADO CLÍNICO DEL CASO ===');
  lines.push(`Tipo de consulta: ${formatWorkflowType(snapshot.workflowType)}`);
  lines.push(`Segmento actual: ${snapshot.currentSegment}`);
  lines.push(`Integridad de la conversación: ${snapshot.integrityStatus}`);
  lines.push('');

  if (snapshot.confirmedFacts.length > 0) {
    lines.push('--- DATOS YA REGISTRADOS (CONFIRMADOS) ---');
    lines.push('No formularlos nuevamente como pregunta abierta. Solo confirmar si hay conflicto, baja confianza o necesidad clínica.');
    for (const fact of snapshot.confirmedFacts) {
      const valueStr = formatValue(fact.value);
      lines.push(`• ${fact.fieldKey}: ${valueStr} [origen: ${fact.originSource}, último: ${fact.latestSource}, confianza: ${fact.confidence}]`);
    }
    lines.push('');
  }

  if (snapshot.derivedFacts.length > 0) {
    lines.push('--- DATOS DERIVADOS ---');
    lines.push('Usar como contexto, confirmar solo si resulta fundamental para el paso actual.');
    for (const fact of snapshot.derivedFacts) {
      const valueStr = formatValue(fact.value);
      lines.push(`• ${fact.fieldKey}: ${valueStr}`);
    }
    lines.push('');
  }

  if (snapshot.draftFacts.length > 0) {
    lines.push('--- HIPÓTESIS BLANDAS (BORRADORES) ---');
    lines.push('No tratarlos como verdad cerrada. Confirmar suavemente según corresponda.');
    for (const fact of snapshot.draftFacts) {
      const valueStr = formatValue(fact.value);
      lines.push(`• ${fact.fieldKey}: ${valueStr}`);
    }
    lines.push('');
  }

  if (snapshot.lockedFacts.length > 0) {
    lines.push('--- CAMPOS BLOQUEADOS (CONFIRMADOS, NO REPREGUNTAR) ---');
    for (const key of snapshot.lockedFacts) {
      lines.push(`• ${key}`);
    }
    lines.push('');
  }

  if (snapshot.safetyCriticalFacts.length > 0) {
    lines.push('--- ALERTAS DE SEGURIDAD FALTANTES (PRIORIDAD ALTA) ---');
    for (const key of snapshot.safetyCriticalFacts) {
      lines.push(`• ${key}`);
    }
    lines.push('');
  }

  if (snapshot.priorityMissingFacts.length > 0) {
    lines.push('--- DATOS FALTANTES (PRIORIDAD DE RECOLECCIÓN) ---');
    const displayMissing = snapshot.priorityMissingFacts.slice(0, 5);
    for (const key of displayMissing) {
      lines.push(`• ${key}`);
    }
    if (snapshot.priorityMissingFacts.length > 5) {
      lines.push(`• ... y ${snapshot.priorityMissingFacts.length - 5} más (enfocarse primero en los sugeridos).`);
    }
    lines.push('');
  }

  if (snapshot.conflictedFacts.length > 0) {
    lines.push('--- DATOS EN CONFLICTO (NECESITAN ACLARACIÓN) ---');
    for (const key of snapshot.conflictedFacts) {
      lines.push(`• ${key}`);
    }
    lines.push('');
  }

  if (snapshot.doNotAskFacts.length > 0) {
    lines.push('--- NO PREGUNTAR (ya resueltos o irrelevantes) ---');
    for (const key of snapshot.doNotAskFacts) {
      lines.push(`• ${key}`);
    }
    lines.push('');
  }

  lines.push('--- REGLAS PARA ESTA SESIÓN ---');
  if (snapshot.nextBestQuestionKeys.length > 0) {
    lines.push(`-> Próximas preguntas sugeridas: ${snapshot.nextBestQuestionKeys.join(', ')}`);
  }
  lines.push('1. NO repitas preguntas sobre datos ya conocidos o bloqueados.');
  lines.push('2. Para datos en CONFLICTO, pedí aclaración específica mencionando la discrepancia.');
  lines.push('3. Priorizá datos faltantes de seguridad clínica.');
  lines.push('4. Si el paciente muestra frustración o repite que ya respondió, NO insistas. Pasá al siguiente dato faltante.');

  if (snapshot.integrityStatus === 'degraded') {
    lines.push('⚠️ INTEGRIDAD DEGRADADA: Usá preguntas cerradas y confirmaciones estructuradas.');
  } else if (snapshot.integrityStatus === 'broken') {
    lines.push('🚨 INTEGRIDAD ROTA: Modo guiado estricto. Solo confirmaciones sí/no. No preguntas abiertas.');
  }

  return lines.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────────────────

function formatWorkflowType(wt: string): string {
  const map: Record<string, string> = {
    psychiatry_first_visit: 'Primera consulta de psiquiatría',
    psychiatry_continuity: 'Continuidad de tratamiento psiquiátrico',
    prescription_renewal: 'Renovación de receta',
    general_consultation: 'Consulta general',
    psychiatric_urgency: 'Urgencia Psiquiátrica / Riesgo clínico',
  };
  return map[wt] ?? wt;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(vacío)';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '(lista vacía)';
    return `[${value.length} items]`;
  }
  if (typeof value === 'object') {
    return '(estructura clínica resumida)';
  }
  return String(value);
}
