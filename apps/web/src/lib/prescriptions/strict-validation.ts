/**
 * Controlled Substances Detection Patterns (Argentina)
 * Used to enforce validity periods and strict validation workflows.
 */

// Estimulantes y sustancias de alto control (Psiquiatría/Neuro)
const STIMULANT_PATTERNS = [
  /\bmetilfenidato\b/i,
  /\bmethylphenidate\b/i,
  /\blisdexanfetamina\b/i,
  /\blisdexamfetamine\b/i,
  /\bvyvanse\b/i,
  /\bconcerta\b/i,
  /\britalin\b/i,
];

// Psicotrópicos (Lista IV - Benzodiacepinas y similares) - 10 días de validez
const PSICOTROPICOS_PATTERNS = [
  /\balprazolam\b/i,
  /\bclonazepam\b/i,
  /\bdiazepam\b/i,
  /\blorazepam\b/i,
  /\bbromazepam\b/i,
  /\bmidazolam\b/i,
  /\bzolpidem\b/i,
  /\bzopiclona\b/i,
  /\bquetiapina\b/i,
  /\brisperidona\b/i,
];

// Estupefacientes (Lista I, II, III - Opioides y derivados) - 5 días de validez
const ESTUPEFACIENTES_PATTERNS = [
  /\bmorfina\b/i,
  /\bfentanilo\b/i,
  /\bmetadona\b/i,
  /\boxicodona\b/i,
  /\btramadol\b/i,
  /\bcodeina\b/i,
  /\bpederina\b/i,
];

export type SubstanceCategory = 'standard' | 'psicotropico' | 'estupefaciente' | 'stimulant';

export function getSubstanceCategory(medicationName: string): SubstanceCategory {
  if (ESTUPEFACIENTES_PATTERNS.some((p) => p.test(medicationName))) return 'estupefaciente';
  if (PSICOTROPICOS_PATTERNS.some((p) => p.test(medicationName))) return 'psicotropico';
  if (STIMULANT_PATTERNS.some((p) => p.test(medicationName))) return 'stimulant';
  return 'standard';
}

/**
 * Returns the legal validity period in days for a given medication category in Argentina.
 */
export function getValidityPeriodDays(medicationName: string): number {
  const category = getSubstanceCategory(medicationName);
  switch (category) {
    case 'estupefaciente': return 5;
    case 'psicotropico': return 10;
    case 'stimulant': return 30; // Stimulants are often List IV but usually handled as 30 days unless specified
    default: return 30;
  }
}

export function requiresStrictPrescriptionValidation(medicationName: string): boolean {
  const category = getSubstanceCategory(medicationName);
  return category !== 'standard';
}

export function buildStrictPrescriptionArtifactWarning(
  medicationName: string,
  digitalArtifactReady: boolean,
): string | null {
  if (!requiresStrictPrescriptionValidation(medicationName) || digitalArtifactReady) {
    return null;
  }

  const category = getSubstanceCategory(medicationName);
  const days = getValidityPeriodDays(medicationName);
  
  return `Medicación controlada (${category}). Validez: ${days} días. Requiere firma digital y registro RCTA para validez legal.`;
}
