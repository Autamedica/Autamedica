import type { 
  ClinicalEvidence, 
  ClinicalResolutionCriterion, 
  ClinicalRedFlag
} from '@autamedica/types/ports';

/**
 * Extracts a numeric value from the clinical evidence based on standard LOINC or parameter mappings
 */
export function getEvidenceValue(evidence: ClinicalEvidence, loincCode: string | null): number | undefined {
  if (!loincCode) return undefined;
  
  const normalized = loincCode.trim().toUpperCase();
  
  // Troponin I Mass/Volume in Serum/Plasma (LOINC: 10839-9)
  if (normalized === '10839-9') {
    if (evidence.troponinHistory && evidence.troponinHistory.length > 0) {
      const sorted = [...evidence.troponinHistory].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      const latest = sorted[sorted.length - 1];
      return latest ? latest.valueNgMl : undefined;
    }
    return undefined;
  }
  
  // ECG ST Segment Elevation (LOINC: 85805-2)
  if (normalized === '85805-2') {
    return evidence.ecgStElevationMm;
  }
  
  // Oxygen Saturation / SpO2 (LOINC: 2708-6)
  if (normalized === '2708-6') {
    return evidence.oxygenSaturationPct;
  }
  
  // Glasgow Coma Scale (LOINC: 9269-2)
  if (normalized === '9269-2') {
    return evidence.glasgowComaScale;
  }
  
  // Pain Visual Analogue Scale (LOINC/Local: pain_vas or VAS)
  if (normalized === 'PAIN_VAS' || normalized === 'VAS') {
    return evidence.painScaleVas;
  }
  
  // Custom or fallback from customParameters
  if (evidence.customParameters) {
    if (evidence.customParameters[normalized] !== undefined) {
      const customVal = evidence.customParameters[normalized];
      if (typeof customVal === 'number') {
        return customVal;
      }
    }
    const originalKey = loincCode.trim();
    if (evidence.customParameters[originalKey] !== undefined) {
      const customVal = evidence.customParameters[originalKey];
      if (typeof customVal === 'number') {
        return customVal;
      }
    }
  }
  
  return undefined;
}

/**
 * Evaluates the clinical rules criteria and red flags dynamically
 */
export function evaluateClinicalSafety(
  evidence: ClinicalEvidence,
  criteria: ClinicalResolutionCriterion[],
  redFlags: ClinicalRedFlag[]
): { isValid: boolean; reason?: string } {
  
  // 1. Red Flags Screening
  for (const flag of redFlags) {
    const hasFlag = 
      (evidence as Record<string, unknown>)[flag.flag_key] === true ||
      (evidence.customParameters?.[flag.flag_key] === true);
      
    if (hasFlag) {
      return { 
        isValid: false, 
        reason: `Alerta de Seguridad: Se ha detectado bandera roja activa - ${flag.flag_display}` 
      };
    }
  }

  // 2. Clinical Resolution Criteria Evaluation
  for (const criterion of criteria) {
    // Skip if loinc_code is missing (should not happen on properly mapped observations)
    const loinc = (criterion as Record<string, unknown>).loinc_code as string | null;
    const value = getEvidenceValue(evidence, loinc);
    
    // Evaluate nullability / requirement
    if (value === undefined) {
      // Check if this criterion was flagged as mandatory (is_required is on clinical_required_observations)
      // Since criteria link to required observations, we check if we must enforce it
      return { 
        isValid: false, 
        reason: `Criterio incompleto: Falta el parámetro clínico requerido para la observación (LOINC ${loinc}).` 
      };
    }

    const threshold = criterion.threshold_value ? Number(criterion.threshold_value) : 0;
    const operator = criterion.operator;

    switch (operator) {
      case '<':
        if (value >= threshold) {
          return { 
            isValid: false, 
            reason: `Límite superado: El valor (${value}) es superior al umbral de seguridad (< ${threshold}).` 
          };
        }
        break;
        
      case '<=':
        if (value > threshold) {
          return { 
            isValid: false, 
            reason: `Límite superado: El valor (${value}) supera el umbral de seguridad (<= ${threshold}).` 
          };
        }
        break;
        
      case '>':
        if (value <= threshold) {
          return { 
            isValid: false, 
            reason: `Límite insatisfactorio: El valor (${value}) es inferior al umbral de seguridad (> ${threshold}).` 
          };
        }
        break;
        
      case '>=':
        if (value < threshold) {
          return { 
            isValid: false, 
            reason: `Límite insatisfactorio: El valor (${value}) no alcanza el umbral de seguridad (>= ${threshold}).` 
          };
        }
        break;
        
      case '==':
        if (value !== threshold) {
          return { 
            isValid: false, 
            reason: `Divergencia clínica: El valor (${value}) difiere del valor esperado (${threshold}).` 
          };
        }
        break;
        
      case 'relative_reduction_pct': {
        if (evidence.peakEcgStElevationMm === undefined) {
          return { 
            isValid: false, 
            reason: 'Dato faltante: Se requiere un registro del pico electrocardiográfico (peakEcgStElevationMm) para calcular la reducción relativa.' 
          };
        }
        const peak = evidence.peakEcgStElevationMm;
        if (peak <= 0) {
          return { isValid: true }; // Prevent division by zero
        }
        const reductionPct = ((peak - value) / peak) * 100;
        const target = criterion.relative_target_pct ? Number(criterion.relative_target_pct) : 50.0;
        
        if (reductionPct < target) {
          return { 
            isValid: false, 
            reason: `Resolución insuficiente: Descenso relativo del ST del ${reductionPct.toFixed(1)}% (Mínimo requerido: >= ${target}%).` 
          };
        }
        break;
      }
        
      case 'trend_descending': {
        if (!evidence.troponinHistory || evidence.troponinHistory.length < 2) {
          return { 
            isValid: false, 
            reason: 'Muestras insuficientes: Se requieren al menos dos mediciones sucesivas en el historial de troponina para evaluar la tendencia cinética.' 
          };
        }
        
        const sortedHistory = [...evidence.troponinHistory].sort(
          (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        const latest = sortedHistory[sortedHistory.length - 1];
        const previous = sortedHistory[sortedHistory.length - 2];
        if (!latest || !previous) {
          return { isValid: true };
        }
        const latestTroponin = latest.valueNgMl;
        const previousTroponin = previous.valueNgMl;
        
        if (latestTroponin > previousTroponin) {
          return { 
            isValid: false, 
            reason: `Curva ascendente detectada: La troponina cardíaca continúa elevándose (${latestTroponin} > ${previousTroponin} ng/mL), lo que indica necrosis miocárdica activa.` 
          };
        }
        break;
      }
        
      default:
        break;
    }
  }

  return { isValid: true };
}
