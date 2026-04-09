const STRICT_VALIDATION_PATTERNS = [
  /\bmetilfenidato\b/i,
  /\bmethylphenidate\b/i,
  /\blisdexanfetamina\b/i,
  /\blisdexamfetamine\b/i,
  /\bvyvanse\b/i,
];

export function requiresStrictPrescriptionValidation(medicationName: string): boolean {
  return STRICT_VALIDATION_PATTERNS.some((pattern) => pattern.test(medicationName));
}

export function buildStrictPrescriptionArtifactWarning(
  medicationName: string,
  digitalArtifactReady: boolean,
): string | null {
  if (!requiresStrictPrescriptionValidation(medicationName) || digitalArtifactReady) {
    return null;
  }

  return "Medicacion con validacion reforzada. Queda como borrador clinico hasta emitir soporte electronico verificable para farmacia.";
}
