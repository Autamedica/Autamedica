
export type PsychiatryTriagePriority = 'routine' | 'priority' | 'urgent';

export interface PsychiatryTriageResult {
  priority: PsychiatryTriagePriority;
  reasons: string[];
}

export function calculatePsychiatryTriage(formData: Record<string, unknown>): PsychiatryTriageResult {
  const reasons: string[] = [];
  let priority: PsychiatryTriagePriority = 'routine';

  // 1. Red Flags (Urgent)
  const redFlags = {
    ideas_autolesion: 'Reporte de ideación autolesiva o pensamientos de autolesión.',
    dolor_pecho: 'Reporte de dolor torácico o falta de aire.',
    crisis_panico: 'Reporte de crisis de pánico u opresión ansiosa severa.'
  };

  for (const [key, reason] of Object.entries(redFlags)) {
    if (formData[key] === true || formData[key] === 'true') {
      priority = 'urgent';
      reasons.push(reason);
    }
  }

  // Extraordinary Dose (>100mg for stimulants)
  const dose = String(formData.dosis_actual || formData.dosis_continuidad || '').toLowerCase();
  const numericDoseMatch = dose.match(/(\d+)/);
  const numericDose = numericDoseMatch ? parseInt(numericDoseMatch[1], 10) : 0;
  if (numericDose >= 100) {
    priority = 'urgent';
    reasons.push(`Dosis extraordinaria detectada: ${numericDose} mg.`);
  }

  // 2. Yellow Flags (Priority) - Skip if already urgent
  if (priority !== 'urgent') {
    // Continuity with low medication (0 or 1-3 days)
    const daysLeft = formData.dias_medicacion_restante;
    if (daysLeft === '0') {
      priority = 'priority';
      reasons.push('Urgencia farmacológica: Paciente sin medicación disponible.');
    } else if (daysLeft === '1-3') {
      priority = 'priority';
      reasons.push('Atención prioritaria: Paciente con menos de 3 días de medicación.');
    }

    // Unknown prescriber for continuity
    const prescriber = String(formData.prescriptor_actual || formData.prescriptor_continuidad || '').toLowerCase();
    const isUnknown = prescriber.includes('no ') || prescriber.includes('recuerdo') || prescriber.length < 4;
    if (formData.tipo_atencion === 'continuidad' && isUnknown) {
      priority = 'priority';
      reasons.push('Incertidumbre en el origen del tratamiento: Prescriptor no identificado.');
    }
  }

  return { priority, reasons };
}
