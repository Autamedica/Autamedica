/**
 * Merge Engine
 *
 * Takes an existing CanonicalField and an IncomingDatum and produces
 * the new field state, including conflict detection, lock enforcement,
 * and provenance tracking.
 *
 * This is the core mutation boundary of the clinical state system.
 * No field should be modified outside this engine.
 */
import type {
  CanonicalField,
  ConversationEvent,
  IncomingDatum,
  UUID,
} from './types';
import { shouldMarkConflict, shouldOverwrite } from './precedence';
import { analyzeMetaContent } from './meta-filter';

// ─── Merge Result ──────────────────────────────────────────────────────

export interface MergeResult<T> {
  field: CanonicalField<T>;
  action: 'created' | 'updated' | 'conflict_detected' | 'rejected' | 'meta_blocked';
  events: ConversationEvent[];
}

// ─── Main Merge Function ───────────────────────────────────────────────

/**
 * Merge a single incoming datum into an existing canonical field.
 *
 * Decision tree:
 * 1. Is the incoming text meta-conversational? → block, don't write
 * 2. Is the existing field locked? → only override with explicit correction or doctor_review
 * 3. Are both values strong and different? → mark conflict
 * 4. Does incoming have higher precedence? → overwrite
 * 5. Otherwise → reject (keep existing)
 */
export function mergeField<T>(
  current: CanonicalField<T>,
  incoming: IncomingDatum<T>,
): MergeResult<T> {
  const events: ConversationEvent[] = [];
  const now = new Date().toISOString();

  // ── Step 1: Meta-conversational filter ──
  if (incoming.rawText) {
    const metaAnalysis = analyzeMetaContent(incoming.rawText);
    if (metaAnalysis.isMeta) {
      events.push({
        id: generateEventId(),
        type: 'meta_conversation_detected',
        timestamp: now,
        fieldKey: current.key,
        payload: {
          matchedPattern: metaAnalysis.matchedPattern,
          blockedText: incoming.rawText,
        },
      });

      return {
        field: current, // unchanged
        action: 'meta_blocked',
        events,
      };
    }
  }

  // ── Step 2: Check for conflict ──
  if (shouldMarkConflict(current, incoming)) {
    const conflictedField: CanonicalField<T> = {
      ...current,
      status: 'conflicted',
      locked: false,
      askable: true,
      needsConfirmation: true,
      conflictReason: `Existing (${String(current.value)}) vs incoming (${String(incoming.value)}) from ${incoming.source}`,
      previousValue: current.value,
      provenance: [
        ...current.provenance,
        {
          source: incoming.source,
          sourceSegment: incoming.sourceSegment,
          rawText: incoming.rawText,
          updatedAt: now,
        },
      ],
      lastUpdatedAt: now,
    };

    events.push({
      id: generateEventId(),
      type: 'field_conflicted',
      timestamp: now,
      fieldKey: current.key,
      payload: {
        existingValue: current.value,
        incomingValue: incoming.value,
        incomingSource: incoming.source,
      },
    });

    return { field: conflictedField, action: 'conflict_detected', events };
  }

  // ── Step 3: Check if incoming should overwrite ──
  if (shouldOverwrite(current, incoming)) {
    const isNew = current.value == null || current.status === 'missing';
    const isConfirmed =
      incoming.explicitConfirmation === true ||
      incoming.source === 'doctor_review';

    const updatedField: CanonicalField<T> = {
      ...current,
      value: incoming.value,
      status: isConfirmed ? 'confirmed' : 'draft',
      confidence: incoming.confidence ?? 'medium',
      confirmed: isConfirmed,
      locked: isConfirmed,
      askable: !isConfirmed,
      needsConfirmation: !isConfirmed && incoming.confidence !== 'high',
      previousValue: current.value,
      conflictReason: undefined, // clear any previous conflict
      provenance: [
        ...current.provenance,
        {
          source: incoming.source,
          sourceSegment: incoming.sourceSegment,
          rawText: incoming.rawText,
          updatedAt: now,
        },
      ],
      lastUpdatedAt: now,
    };

    events.push({
      id: generateEventId(),
      type: 'field_updated',
      timestamp: now,
      fieldKey: current.key,
      payload: {
        previousValue: current.value,
        newValue: incoming.value,
        source: incoming.source,
        confidence: incoming.confidence,
      },
    });

    if (isConfirmed) {
      events.push({
        id: generateEventId(),
        type: 'field_locked',
        timestamp: now,
        fieldKey: current.key,
      });
    }

    return {
      field: updatedField,
      action: isNew ? 'created' : 'updated',
      events,
    };
  }

  // ── Step 4: Reject — existing value is stronger ──
  return { field: current, action: 'rejected', events };
}

// ─── Batch Merge ───────────────────────────────────────────────────────

export interface BatchMergeResult {
  updatedFieldKeys: string[];
  conflictedFieldKeys: string[];
  metaBlockedKeys: string[];
  allEvents: ConversationEvent[];
}

/**
 * Merge multiple incoming data into a map of canonical fields.
 *
 * @param fields - Map of fieldKey → CanonicalField (will be mutated in-place)
 * @param data - Array of incoming data to merge
 * @returns Summary of what happened
 */
export function batchMerge(
  fields: Map<string, CanonicalField<unknown>>,
  data: IncomingDatum[],
): BatchMergeResult {
  const result: BatchMergeResult = {
    updatedFieldKeys: [],
    conflictedFieldKeys: [],
    metaBlockedKeys: [],
    allEvents: [],
  };

  for (const datum of data) {
    let current = fields.get(datum.fieldKey);

    // If field doesn't exist yet, create it as missing
    if (!current) {
      current = {
        key: datum.fieldKey,
        value: null,
        status: 'missing',
        confidence: 'low',
        confirmed: false,
        locked: false,
        provenance: [],
        lastUpdatedAt: new Date().toISOString(),
        askable: true,
        needsConfirmation: false,
      };
    }

    const mergeResult = mergeField(current, datum);
    fields.set(datum.fieldKey, mergeResult.field);
    result.allEvents.push(...mergeResult.events);

    switch (mergeResult.action) {
      case 'created':
      case 'updated':
        result.updatedFieldKeys.push(datum.fieldKey);
        break;
      case 'conflict_detected':
        result.conflictedFieldKeys.push(datum.fieldKey);
        break;
      case 'meta_blocked':
        result.metaBlockedKeys.push(datum.fieldKey);
        break;
      // 'rejected' → nothing
    }
  }

  return result;
}

// ─── Utils ─────────────────────────────────────────────────────────────

let eventCounter = 0;

function generateEventId(): UUID {
  eventCounter++;
  const ts = Date.now().toString(36);
  const seq = eventCounter.toString(36).padStart(4, '0');
  const rand = Math.random().toString(36).slice(2, 6);
  return `evt_${ts}_${seq}_${rand}`;
}
