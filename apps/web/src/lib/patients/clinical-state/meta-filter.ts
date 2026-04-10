/**
 * Meta-Conversational Filter
 *
 * Detects when a patient's utterance is about the INTERFACE or the PROCESS
 * rather than about their actual clinical condition.
 *
 * These utterances must NEVER pollute clinical fields.
 *
 * Examples of meta-conversation:
 *   - "Ya te respondí eso"
 *   - "¿Qué más tengo que contestar?"
 *   - "Te estoy escuchando"
 *   - "Me repite la pregunta"
 *   - "Hola, buenas"
 */

// ─── Pattern Library ───────────────────────────────────────────────────

const META_PATTERNS: RegExp[] = [
  // Frustration / repetition complaints
  /ya\s+(te\s+)?(lo\s+)?contest[eéó]/i,
  /ya\s+(te\s+)?(lo\s+)?respond[ií]/i,
  /ya\s+(te\s+)?(lo\s+)?dij[eéo]/i,
  /me\s+repite/i,
  /me\s+está[sn]?\s+repitiendo/i,
  /otra\s+vez\s+(la\s+misma|lo\s+mismo)/i,
  /eso\s+ya\s+(te\s+)?lo\s+(dije|respondí|contesté)/i,

  // Process inquiries
  /qué\s+(más\s+)?(preguntas?|tengo\s+que\s+contestar|falta)/i,
  /cuántas?\s+(más\s+)?preguntas/i,
  /qué\s+otra[s]?\s+pregunta/i,
  /falta\s+mucho/i,
  /ya\s+terminamos/i,
  /cuánto\s+falta/i,

  // Passive listening signals (not clinical data)
  /^te\s+estoy\s+escuchando\.?$/i,
  /^te\s+escucho\.?$/i,
  /^sí,?\s+te\s+escucho\.?$/i,
  /^ok\.?$/i,
  /^dale\.?$/i,
  /^listo\.?$/i,

  // Greetings (not clinical)
  /^hola\.?$/i,
  /^buenas\.?$/i,
  /^buen(os)?\s+(días|tardes|noches)\.?$/i,

  // System confusion
  /no\s+(te\s+)?entiendo\s+(la\s+)?pregunta/i,
  /puedes?\s+repetir/i,
  /no\s+entendí/i,
  /como\s+es\s+eso/i,
  /a\s+qué\s+te\s+referís/i,
];

/**
 * Length threshold: very short texts that match meta patterns
 * are almost certainly not clinical data.
 */
const META_MAX_LENGTH = 120;

// ─── Public API ────────────────────────────────────────────────────────

export interface MetaFilterResult {
  isMeta: boolean;
  matchedPattern?: string;
  originalText: string;
}

/**
 * Determine if a patient utterance is meta-conversational noise.
 *
 * Returns true if the text is about the interface/process,
 * not about clinical symptoms or history.
 */
export function isMetaConversational(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true; // empty = nothing clinical

  // Long texts are unlikely to be pure meta, even if they contain a pattern.
  // e.g. "Ya te respondí eso, pero también quiero decir que me duele la cabeza"
  // -> the clinical part ("me duele la cabeza") matters.
  if (trimmed.length > META_MAX_LENGTH) return false;

  return META_PATTERNS.some((rx) => rx.test(trimmed));
}

/**
 * Full analysis with matched pattern info for debugging/events.
 */
export function analyzeMetaContent(text: string): MetaFilterResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { isMeta: true, matchedPattern: 'empty_text', originalText: text };
  }

  if (trimmed.length > META_MAX_LENGTH) {
    return { isMeta: false, originalText: text };
  }

  for (const rx of META_PATTERNS) {
    if (rx.test(trimmed)) {
      return {
        isMeta: true,
        matchedPattern: rx.source,
        originalText: text,
      };
    }
  }

  return { isMeta: false, originalText: text };
}

/**
 * Strip meta-conversational fragments from a longer text.
 * Useful when some sentences are meta and others are clinical.
 *
 * Splits by sentence boundaries, filters out meta sentences,
 * and returns the cleaned clinical text.
 */
export function stripMetaFragments(text: string): string {
  const sentences = text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const clinical = sentences.filter((s) => !isMetaConversational(s));

  return clinical.join('. ').trim();
}
