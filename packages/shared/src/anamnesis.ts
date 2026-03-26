import type { Json } from '@autamedica/types';

export interface AnamnesisSectionRecord {
  section: string;
  data: Json;
  completed?: boolean | null;
  updated_at?: string | null;
}

export interface AnamnesisSummarySection {
  title: string;
  items: string[];
}

export interface AnamnesisSummary {
  headline: string;
  narrative: string[];
  sections: AnamnesisSummarySection[];
  completedSections: number;
  lastUpdatedAt: string | null;
}

interface ComplaintAnalysis {
  rawComplaint: string | null;
  dominantComplaint: string | null;
  dominantSource: string | null;
  appearsContextual: boolean;
  repeatedNarrative: string | null;
}

interface SystemsAnalysis {
  section: AnamnesisSummarySection;
  positiveFindings: string[];
  qualityAlerts: string[];
}

const NONE_VALUES = new Set(['ninguno', 'ninguna', 'no_hermanos', 'no']);

const VALUE_LABELS: Record<string, Record<string, string>> = {
  exposicion_riesgos: {
    quimicos: 'exposicion a quimicos o vapores',
    ruido: 'ruido intenso',
    polvo: 'polvo o particulas',
    pantallas: 'uso prolongado de pantallas',
    cargas: 'manipulacion frecuente de cargas',
    estres: 'estres laboral elevado',
  },
  cuando_empezo: {
    hoy: 'inicio el mismo dia de la consulta',
    '2-7dias': 'evolucion de 2 a 7 dias',
    '1-4semanas': 'evolucion de 1 a 4 semanas',
    '1-6meses': 'evolucion de 1 a 6 meses',
    mas6meses: 'evolucion mayor de 6 meses',
  },
  enfermedades_cronicas: {
    diabetes: 'diabetes',
    hipertension: 'hipertension arterial',
    asma: 'asma',
    epilepsia: 'epilepsia',
    cancer: 'cancer',
    hepatitis: 'hepatitis B o C',
    vih: 'VIH',
    tiroides: 'patologia tiroidea',
  },
  padre_enfermedades: {
    diabetes: 'diabetes',
    hipertension: 'hipertension arterial',
    infarto: 'infarto de miocardio',
    cancer: 'cancer',
    colesterol_alto: 'hipercolesterolemia',
  },
  madre_enfermedades: {
    diabetes: 'diabetes',
    hipertension: 'hipertension arterial',
    cancer_mama: 'cancer de mama',
    cancer_ovario: 'cancer de ovario',
    osteoporosis: 'osteoporosis',
    tiroides: 'patologia tiroidea',
  },
  hermanos_enfermedades: {
    diabetes: 'diabetes',
    cancer_joven: 'cancer de inicio precoz',
    enfermedad_mental: 'patologia psiquiatrica',
    autoinmune: 'enfermedad autoinmune',
  },
  fuma: {
    nunca: 'nunca fumo',
    exfumador: 'antecedente de tabaquismo, actualmente suspendido',
    actual: 'tabaquismo activo',
  },
  alcohol: {
    nunca: 'niega consumo de alcohol',
    ocasional: 'consumo ocasional de alcohol',
    moderado: 'consumo moderado de alcohol',
    frecuente: 'consumo frecuente de alcohol',
    diario: 'consumo diario de alcohol',
  },
  ejercicio: {
    sedentario: 'sedentarismo',
    ligero: 'actividad fisica ligera',
    moderado: 'actividad fisica moderada',
    intenso: 'actividad fisica intensa',
  },
  dieta: {
    muy_mala: 'alimentacion basada en ultraprocesados o comida rapida',
    regular: 'alimentacion mixta, con procesados y comida casera',
    buena: 'alimentacion principalmente casera y balanceada',
    excelente: 'patron alimentario cercano a dieta mediterranea',
  },
  sintomas_cardiovasculares: {
    mareos: 'mareos o desmayos',
    sudoracion: 'sudoracion fria',
    fatiga_extrema: 'fatiga extrema',
    tos_nocturna: 'tos nocturna o al acostarse',
  },
  sintomas_respiratorios: {
    sangre_tos: 'hemoptisis',
    dolor_respirar: 'dolor con la inspiracion profunda',
    ronquidos: 'ronquidos intensos con pausas respiratorias',
    flema_color: 'expectoration amarilla o verde persistente',
  },
  cambio_habito_intestinal: {
    no: 'sin cambios referidos del habito intestinal',
    diarrea: 'diarrea frecuente',
    estrenimiento: 'estrenimiento',
    alternante: 'alternancia entre diarrea y estrenimiento',
  },
  sintomas_digestivos: {
    sangre_heces: 'sangre en heces',
    heces_negras: 'heces negras o melena',
    perdida_peso: 'perdida de peso involuntaria',
    dificultad_tragar: 'disfagia',
    nausea_vomito: 'nauseas o vomitos persistentes',
    hinchazon: 'distension o hinchazon abdominal persistente',
  },
  frecuencia_urinaria: {
    normal: 'sin cambios referidos en la frecuencia urinaria',
    frecuente_dia: 'aumento de la frecuencia miccional diurna',
    frecuente_noche: 'nicturia',
    urgencia: 'urgencia miccional',
  },
  sintomas_genitourinarios: {
    sangre_orina: 'hematuria',
    chorro_debil: 'chorro urinario debil o entrecortado',
    incontinencia: 'incontinencia urinaria',
    dolor_lumbar: 'dolor lumbar compatible con via urinaria alta',
  },
};

function asRecord(value: Json | undefined): Record<string, Json> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, Json>;
  }

  return {};
}

function asBoolean(value: Json | undefined): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  return null;
}

function asString(value: Json | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: Json | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asStringList(value: Json | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => asString(item)).filter((item): item is string => item != null);
}

function appendItem(target: string[], value: string | null | undefined): void {
  if (!value) return;
  target.push(value);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function joinList(values: string[]): string | null {
  const normalized = unique(values);
  return normalized.length > 0 ? normalized.join(', ') : null;
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatStoredDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  return value;
}

function formatOptionValue(fieldId: string, value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return VALUE_LABELS[fieldId]?.[normalized] ?? normalized.replaceAll('_', ' ');
}

function formatOptionList(fieldId: string, values: string[]): string[] {
  return values
    .filter((value) => !NONE_VALUES.has(value))
    .map((value) => formatOptionValue(fieldId, value))
    .filter((value): value is string => value != null);
}

function isMeaningfulText(value: string | null): value is string {
  return value != null && normalizeText(value).length > 0;
}

function isContextOnlyText(value: string | null): boolean {
  if (!value) return false;
  const normalized = normalizeText(value);
  const symptomHints = [
    'dolor',
    'duele',
    'cefalea',
    'migra',
    'presion',
    'opres',
    'ardor',
    'mareo',
    'nausea',
    'vomito',
    'falta de aire',
    'tos',
    'diarrea',
    'incontinencia',
  ];
  const contextHints = [
    'cuando estoy',
    'cuando uso',
    'en la computadora',
    'con la computadora',
    'en el trabajo',
    'siempre cuando',
    'cuando me siento',
  ];

  return contextHints.some((hint) => normalized.includes(hint)) &&
    !symptomHints.some((hint) => normalized.includes(hint));
}

function complaintScore(value: string): number {
  const normalized = normalizeText(value);
  const symptomHints = [
    'dolor',
    'duele',
    'cefalea',
    'cabeza',
    'presion',
    'garganta',
    'pecho',
    'opres',
    'ardor',
    'mareo',
    'palpit',
    'falta de aire',
    'nausea',
    'vomito',
    'diarrea',
    'sangre',
  ];
  let score = 0;

  for (const hint of symptomHints) {
    if (normalized.includes(hint)) {
      score += 3;
    }
  }

  if (normalized.length >= 24) score += 1;
  if (isContextOnlyText(value)) score -= 4;

  return score;
}

function buildSectionMap(sections: AnamnesisSectionRecord[]): Map<string, AnamnesisSectionRecord> {
  const map = new Map<string, AnamnesisSectionRecord>();
  for (const section of sections) {
    map.set(section.section, section);
  }

  return map;
}

function getSectionData(
  sectionMap: Map<string, AnamnesisSectionRecord>,
  sectionId: string,
): Record<string, Json> {
  return asRecord(sectionMap.get(sectionId)?.data);
}

function buildFamilyMemberSummary(input: {
  relation: string;
  alive: boolean | null;
  age: number | null;
  diseases: string[];
  deathCause: string | null;
}): string {
  const fragments: string[] = [];
  if (input.alive === true) {
    fragments.push('vivo');
  } else if (input.alive === false) {
    fragments.push('fallecido');
  } else {
    fragments.push('estado vital no documentado');
  }

  if (input.age != null && input.alive === true) {
    fragments.push(`${input.age} anos`);
  }

  const diseaseList = joinList(input.diseases);
  if (diseaseList) {
    fragments.push(`antecedentes de ${diseaseList}`);
  }

  if (input.deathCause) {
    fragments.push(`causa de muerte referida: ${input.deathCause}`);
  }

  return `${input.relation}: ${fragments.join('; ')}.`;
}

function buildComplaintAnalysis(
  sectionMap: Map<string, AnamnesisSectionRecord>,
): ComplaintAnalysis {
  const complaintData = getSectionData(sectionMap, 'motivo_consulta');
  const cardiovascularData = getSectionData(sectionMap, 'cardiovascular');
  const respiratoryData = getSectionData(sectionMap, 'respiratorio');
  const digestiveData = getSectionData(sectionMap, 'digestivo');
  const genitourinaryData = getSectionData(sectionMap, 'genitourinario');
  const finalData = getSectionData(sectionMap, 'resumen_final');

  const candidates = [
    { source: 'motivo_consulta', text: asString(complaintData.sintoma_principal) },
    { source: 'comentarios_adicionales', text: asString(finalData.comentarios_adicionales) },
    { source: 'cardiovascular', text: asString(cardiovascularData.dolor_pecho_detalle) },
    { source: 'respiratorio', text: asString(respiratoryData.tos_detalle) },
    { source: 'digestivo', text: asString(digestiveData.dolor_abdominal_detalle) },
    { source: 'genitourinario', text: asString(genitourinaryData.sintomas_genitourinarios_detalle) },
  ].filter((candidate): candidate is { source: string; text: string } => isMeaningfulText(candidate.text));

  const grouped = new Map<string, { count: number; sample: string }>();
  for (const candidate of candidates) {
    const key = normalizeText(candidate.text);
    if (key.length < 12) continue;
    const current = grouped.get(key);
    grouped.set(key, {
      count: (current?.count ?? 0) + 1,
      sample: current?.sample ?? candidate.text,
    });
  }

  let repeatedNarrative: string | null = null;
  for (const value of grouped.values()) {
    if (value.count >= 2) {
      repeatedNarrative = value.sample;
      break;
    }
  }

  const sortedCandidates = [...candidates]
    .map((candidate) => ({
      ...candidate,
      score: complaintScore(candidate.text),
    }))
    .sort((left, right) => right.score - left.score || right.text.length - left.text.length);

  const rawComplaint = asString(complaintData.sintoma_principal);
  const dominant = sortedCandidates.find((candidate) => candidate.score > 0) ?? null;

  return {
    rawComplaint,
    dominantComplaint: dominant?.text ?? rawComplaint,
    dominantSource: dominant?.source ?? (rawComplaint ? 'motivo_consulta' : null),
    appearsContextual: isContextOnlyText(rawComplaint),
    repeatedNarrative,
  };
}

function buildPersonalDataSection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
): AnamnesisSummarySection {
  const ageData = getSectionData(sectionMap, 'edad');
  const occupationData = getSectionData(sectionMap, 'ocupacion');

  const age = asNumber(ageData.edad);
  const birthDate = formatStoredDate(asString(ageData.fecha_nacimiento));
  const occupation = asString(occupationData.ocupacion_actual);
  const years = asNumber(occupationData['años_ocupacion']);
  const risks = joinList(formatOptionList('exposicion_riesgos', asStringList(occupationData.exposicion_riesgos)));

  const items: string[] = [];
  appendItem(items, age != null ? `Edad referida: ${age} anos.` : 'Edad: dato no documentado.');
  appendItem(items, birthDate ? `Fecha de nacimiento: ${birthDate}.` : 'Fecha de nacimiento: dato no documentado.');
  appendItem(items, occupation ? `Ocupacion actual: ${occupation}.` : 'Ocupacion actual: dato no documentado.');
  appendItem(items, years != null ? `Antiguedad laboral en la ocupacion actual: ${years} anos.` : null);
  appendItem(items, risks ? `Exposiciones ocupacionales relevadas: ${risks}.` : 'Exposiciones ocupacionales: no se documentaron exposiciones especificas.');
  appendItem(
    items,
    'Sexo, estado civil, nacionalidad y domicilio no son relevados por el flujo digital actual; deben completarse en la entrevista clinica.',
  );

  return {
    title: 'Datos personales',
    items,
  };
}

function buildReasonSection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
  complaint: ComplaintAnalysis,
): AnamnesisSummarySection {
  const complaintData = getSectionData(sectionMap, 'motivo_consulta');
  const started = formatOptionValue('cuando_empezo', asString(complaintData.cuando_empezo));
  const intensity = asNumber(complaintData.intensidad_sintoma);

  const items: string[] = [];
  appendItem(
    items,
    complaint.dominantComplaint
      ? `Queja cardinal recuperada del relato del paciente: "${complaint.dominantComplaint}".`
      : 'No se logra recuperar con claridad una queja cardinal a partir de los campos cargados.',
  );

  if (complaint.rawComplaint && complaint.rawComplaint !== complaint.dominantComplaint) {
    appendItem(
      items,
      `Texto ingresado en el campo inicial de motivo de consulta: "${complaint.rawComplaint}".`,
    );
  }

  if (complaint.appearsContextual && complaint.rawComplaint) {
    appendItem(
      items,
      'El motivo de consulta inicial parece describir un desencadenante o contexto, mas que un sintoma cardinal; requiere reinterrogatorio dirigido.',
    );
  }

  appendItem(items, started ? `Tiempo de evolucion referido: ${started}.` : 'Tiempo de evolucion: dato no documentado.');
  appendItem(
    items,
    intensity != null
      ? `Intensidad subjetiva consignada: ${intensity}/10, a validar respecto del sintoma cardinal.`
      : 'Intensidad subjetiva: dato no documentado.',
  );

  return {
    title: 'Motivo de consulta',
    items,
  };
}

function buildCurrentIllnessSection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
  complaint: ComplaintAnalysis,
  systems: SystemsAnalysis,
): AnamnesisSummarySection {
  const complaintData = getSectionData(sectionMap, 'motivo_consulta');
  const started = formatOptionValue('cuando_empezo', asString(complaintData.cuando_empezo));
  const intensity = asNumber(complaintData.intensidad_sintoma);

  const items: string[] = [];

  appendItem(
    items,
    complaint.dominantComplaint
      ? `Sintoma o padecimiento dominante reconstruido: "${complaint.dominantComplaint}".`
      : 'No se identifica un padecimiento dominante con semantica clinica suficiente.',
  );
  appendItem(items, started ? `Cronologia disponible: ${started}.` : 'Cronologia: el formulario no recupera con precision la secuencia de inicio y evolucion.');
  appendItem(
    items,
    intensity != null
      ? `Intensidad consignada: ${intensity}/10.`
      : null,
  );

  if (systems.positiveFindings.length > 0) {
    appendItem(
      items,
      `Sintomas asociados recuperados por interrogatorio dirigido: ${joinList(systems.positiveFindings)}.`,
    );
  }

  if (complaint.repeatedNarrative) {
    appendItem(
      items,
      `Se detecta reiteracion del mismo relato en multiples campos libres ("${complaint.repeatedNarrative}"), compatible con intento del paciente de hacer visible un sintoma no bien capturado por la pregunta inicial.`,
    );
  }

  appendItem(
    items,
    'Faltan, o deben corroborarse en entrevista dirigida, la localizacion precisa, caracter, irradiacion, forma de inicio, factores agravantes/atenuantes, tratamientos previos y orden cronologico de los sintomas.',
  );

  return {
    title: 'Enfermedad actual',
    items,
  };
}

function buildPhysiologicalBackgroundSection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
): AnamnesisSummarySection {
  const ageData = getSectionData(sectionMap, 'edad');
  const age = asNumber(ageData.edad);
  const birthDate = formatStoredDate(asString(ageData.fecha_nacimiento));

  const items: string[] = [];
  appendItem(items, age != null ? `Edad: ${age} anos.` : 'Edad: dato no documentado.');
  appendItem(items, birthDate ? `Fecha de nacimiento: ${birthDate}.` : null);
  appendItem(
    items,
    'Antecedentes de nacimiento, crecimiento, desarrollo, maduracion sexual y antecedentes gineco-obstetricos no son relevados por el flujo digital actual.',
  );

  return {
    title: 'Antecedentes personales fisiologicos',
    items,
  };
}

function buildPathologicalBackgroundSection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
): AnamnesisSummarySection {
  const diseasesData = getSectionData(sectionMap, 'enfermedades_previas');
  const medicationsData = getSectionData(sectionMap, 'medicamentos');
  const allergiesData = getSectionData(sectionMap, 'alergias');

  const chronicDiseases = formatOptionList(
    'enfermedades_cronicas',
    asStringList(diseasesData.enfermedades_cronicas),
  );
  const medicationList = asString(medicationsData.lista_medicamentos);
  const takesMedication = asBoolean(medicationsData.toma_medicamentos);
  const allergyList = asString(allergiesData.lista_alergias);
  const hasAllergies = asBoolean(allergiesData.tiene_alergias);

  const items: string[] = [];
  appendItem(
    items,
    chronicDiseases.length > 0
      ? `Antecedentes patologicos relevados: ${joinList(chronicDiseases)}.`
      : 'Antecedentes patologicos cronicos: no se consignan enfermedades de las opciones relevadas.',
  );

  if (takesMedication === true) {
    appendItem(
      items,
      medicationList
        ? `Medicacion habitual referida: ${medicationList}.`
        : 'Refiere medicacion habitual, pero no detalla nombre, dosis ni esquema.',
    );
  } else if (takesMedication === false) {
    appendItem(items, 'Niega medicacion actual.');
  } else {
    appendItem(items, 'Medicacion actual: dato no documentado.');
  }

  if (hasAllergies === true) {
    appendItem(
      items,
      allergyList
        ? `Alergias o reacciones previas referidas: ${allergyList}.`
        : 'Refiere alergias o reacciones previas, pero no las caracteriza.',
    );
  } else if (hasAllergies === false) {
    appendItem(items, 'Niega alergias conocidas.');
  } else {
    appendItem(items, 'Alergias: dato no documentado.');
  }

  appendItem(
    items,
    'Cirugias, internaciones, traumatismos, transfusiones y enfermedades de la infancia no son relevados por este flujo digital y deben incorporarse en la anamnesis profesional.',
  );

  return {
    title: 'Antecedentes personales patologicos',
    items,
  };
}

function buildHabitsSection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
): AnamnesisSummarySection {
  const occupationData = getSectionData(sectionMap, 'ocupacion');
  const habitsData = getSectionData(sectionMap, 'habitos');

  const smoking = asString(habitsData.fuma);
  const cigarettesPerDay = asNumber(habitsData.cigarrillos_dia);
  const smokingYears = asNumber(habitsData.años_fumando);
  const alcohol = formatOptionValue('alcohol', asString(habitsData.alcohol));
  const exercise = formatOptionValue('ejercicio', asString(habitsData.ejercicio));
  const sleepHours = asNumber(habitsData.horas_sueno);
  const diet = formatOptionValue('dieta', asString(habitsData.dieta));
  const risks = joinList(formatOptionList('exposicion_riesgos', asStringList(occupationData.exposicion_riesgos)));

  const items: string[] = [];

  if (smoking) {
    let smokingText = `Tabaquismo: ${formatOptionValue('fuma', smoking)}.`;
    if (cigarettesPerDay != null) {
      smokingText += ` ${cigarettesPerDay} cigarrillos por dia.`;
    }
    if (smokingYears != null) {
      smokingText += ` ${smokingYears} anos de exposicion.`;
    }
    if (cigarettesPerDay != null && smokingYears != null) {
      const packYears = Number(((cigarettesPerDay / 20) * smokingYears).toFixed(1));
      smokingText += ` Carga tabacica estimada: ${packYears} paquetes-ano.`;
    }
    appendItem(items, smokingText);
  } else {
    appendItem(items, 'Tabaquismo: dato no documentado.');
  }

  appendItem(items, alcohol ? `Alcohol: ${alcohol}.` : 'Alcohol: dato no documentado.');
  appendItem(items, exercise ? `Actividad fisica: ${exercise}.` : 'Actividad fisica: dato no documentado.');
  appendItem(items, sleepHours != null ? `Sueno habitual: ${sleepHours} horas por noche.` : 'Horas de sueno: dato no documentado.');
  appendItem(items, diet ? `Patron alimentario referido: ${diet}.` : 'Patron alimentario: dato no documentado.');
  appendItem(items, risks ? `Riesgos ocupacionales coexistentes: ${risks}.` : null);
  appendItem(
    items,
    'Condiciones de vivienda, nivel socioeconomico, diuresis y catarsis no forman parte del cuestionario digital actual; deben relevarse en el interrogatorio clinico.',
  );

  return {
    title: 'Antecedentes personales de medio y habitos',
    items,
  };
}

function buildFamilySection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
): AnamnesisSummarySection {
  const familyData = getSectionData(sectionMap, 'antecedentes_familiares');

  const items: string[] = [];
  items.push(
    buildFamilyMemberSummary({
      relation: 'Padre',
      alive: asBoolean(familyData.padre_vivo),
      age: asNumber(familyData.padre_edad),
      diseases: formatOptionList('padre_enfermedades', asStringList(familyData.padre_enfermedades)),
      deathCause: asString(familyData.padre_causa_muerte),
    }),
  );
  items.push(
    buildFamilyMemberSummary({
      relation: 'Madre',
      alive: asBoolean(familyData.madre_viva),
      age: asNumber(familyData.madre_edad),
      diseases: formatOptionList('madre_enfermedades', asStringList(familyData.madre_enfermedades)),
      deathCause: asString(familyData.madre_causa_muerte),
    }),
  );

  const siblingDiseases = formatOptionList(
    'hermanos_enfermedades',
    asStringList(familyData.hermanos_enfermedades),
  );

  if (asStringList(familyData.hermanos_enfermedades).includes('no_hermanos')) {
    items.push('Hermanos: el paciente refiere no tener hermanos.');
  } else if (siblingDiseases.length > 0) {
    items.push(`Hermanos: se refieren antecedentes de ${joinList(siblingDiseases)}.`);
  } else {
    items.push('Hermanos: sin antecedentes consignados de relevancia.');
  }

  items.push(
    'La pesquisa digital actual no releva con detalle edad de inicio, arbol genealogico ampliado ni antecedentes infectocontagiosos familiares; completar en entrevista si cambia la sospecha clinica.',
  );

  return {
    title: 'Antecedentes familiares',
    items,
  };
}

function formatSystemSummary(
  label: string,
  positives: string[],
  negatives: string[],
  details: string[],
): string {
  const fragments: string[] = [];
  const positiveSummary = joinList(positives);
  const negativeSummary = joinList(negatives);
  const detailSummary = joinList(details);

  if (positiveSummary) {
    fragments.push(`positivos por ${positiveSummary}`);
  }

  if (negativeSummary) {
    fragments.push(`niega ${negativeSummary}`);
  }

  if (detailSummary) {
    fragments.push(`detalle libre: ${detailSummary}`);
  }

  if (fragments.length === 0) {
    return `${label}: sin informacion util para interpretacion clinica.`;
  }

  return `${label}: ${fragments.join('; ')}.`;
}

function buildSystemsSection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
  complaint: ComplaintAnalysis,
): SystemsAnalysis {
  const items: string[] = [];
  const positiveFindings: string[] = [];
  const qualityAlerts: string[] = [];
  const repeatedNarrativeKey = complaint.repeatedNarrative ? normalizeText(complaint.repeatedNarrative) : null;

  const cardiovascularData = getSectionData(sectionMap, 'cardiovascular');
  const cardiovascularPositives: string[] = [];
  const cardiovascularNegatives: string[] = [];
  const cardiovascularDetails: string[] = [];
  if (asBoolean(cardiovascularData.dolor_pecho) === true) cardiovascularPositives.push('dolor o molestia toracica');
  if (asBoolean(cardiovascularData.dolor_pecho) === false) cardiovascularNegatives.push('dolor toracico');
  if (asBoolean(cardiovascularData.falta_aire) === true) cardiovascularPositives.push('falta de aire');
  if (asBoolean(cardiovascularData.falta_aire) === false) cardiovascularNegatives.push('falta de aire');
  if (asBoolean(cardiovascularData.palpitaciones) === true) cardiovascularPositives.push('palpitaciones');
  if (asBoolean(cardiovascularData.palpitaciones) === false) cardiovascularNegatives.push('palpitaciones');
  if (asBoolean(cardiovascularData.hinchazon_piernas) === true) cardiovascularPositives.push('edema de miembros inferiores');
  if (asBoolean(cardiovascularData.hinchazon_piernas) === false) cardiovascularNegatives.push('edema de miembros inferiores');
  cardiovascularPositives.push(...formatOptionList('sintomas_cardiovasculares', asStringList(cardiovascularData.sintomas_cardiovasculares)));
  const chestDetail = asString(cardiovascularData.dolor_pecho_detalle);
  if (chestDetail && normalizeText(chestDetail) !== repeatedNarrativeKey) cardiovascularDetails.push(chestDetail);
  items.push(formatSystemSummary('Cardiovascular', cardiovascularPositives, cardiovascularNegatives, cardiovascularDetails));
  positiveFindings.push(...cardiovascularPositives.map((value) => `cardiovascular: ${value}`));

  const respiratoryData = getSectionData(sectionMap, 'respiratorio');
  const respiratoryPositives: string[] = [];
  const respiratoryNegatives: string[] = [];
  const respiratoryDetails: string[] = [];
  if (asBoolean(respiratoryData.tos) === true) respiratoryPositives.push('tos persistente');
  if (asBoolean(respiratoryData.tos) === false) respiratoryNegatives.push('tos persistente');
  if (asBoolean(respiratoryData.falta_aire_respiratorio) === true) respiratoryPositives.push('disnea de esfuerzo');
  if (asBoolean(respiratoryData.falta_aire_respiratorio) === false) respiratoryNegatives.push('disnea de esfuerzo');
  if (asBoolean(respiratoryData.silbido_pecho) === true) respiratoryPositives.push('sibilancias');
  if (asBoolean(respiratoryData.silbido_pecho) === false) respiratoryNegatives.push('sibilancias');
  respiratoryPositives.push(...formatOptionList('sintomas_respiratorios', asStringList(respiratoryData.sintomas_respiratorios)));
  const coughDetail = asString(respiratoryData.tos_detalle);
  if (coughDetail && normalizeText(coughDetail) !== repeatedNarrativeKey) respiratoryDetails.push(coughDetail);
  items.push(formatSystemSummary('Respiratorio', respiratoryPositives, respiratoryNegatives, respiratoryDetails));
  positiveFindings.push(...respiratoryPositives.map((value) => `respiratorio: ${value}`));

  const digestiveData = getSectionData(sectionMap, 'digestivo');
  const digestivePositives: string[] = [];
  const digestiveNegatives: string[] = [];
  if (asBoolean(digestiveData.acidez) === true) digestivePositives.push('acidez o reflujo');
  if (asBoolean(digestiveData.acidez) === false) digestiveNegatives.push('acidez o reflujo');
  if (asBoolean(digestiveData.dolor_abdominal) === true) digestivePositives.push('dolor abdominal persistente');
  if (asBoolean(digestiveData.dolor_abdominal) === false) digestiveNegatives.push('dolor abdominal persistente');
  const bowelHabit = formatOptionValue('cambio_habito_intestinal', asString(digestiveData.cambio_habito_intestinal));
  if (bowelHabit && asString(digestiveData.cambio_habito_intestinal) !== 'no') digestivePositives.push(bowelHabit);
  if (asString(digestiveData.cambio_habito_intestinal) === 'no') digestiveNegatives.push('cambios del habito intestinal');
  digestivePositives.push(...formatOptionList('sintomas_digestivos', asStringList(digestiveData.sintomas_digestivos)));
  items.push(formatSystemSummary('Digestivo', digestivePositives, digestiveNegatives, []));
  positiveFindings.push(...digestivePositives.map((value) => `digestivo: ${value}`));

  const genitourinaryData = getSectionData(sectionMap, 'genitourinario');
  const genitourinaryPositives: string[] = [];
  const genitourinaryNegatives: string[] = [];
  if (asBoolean(genitourinaryData.dolor_orinar) === true) genitourinaryPositives.push('dolor o ardor al orinar');
  if (asBoolean(genitourinaryData.dolor_orinar) === false) genitourinaryNegatives.push('dolor o ardor al orinar');
  const urinaryFrequency = formatOptionValue('frecuencia_urinaria', asString(genitourinaryData.frecuencia_urinaria));
  if (urinaryFrequency && asString(genitourinaryData.frecuencia_urinaria) !== 'normal') {
    genitourinaryPositives.push(urinaryFrequency);
  }
  if (asString(genitourinaryData.frecuencia_urinaria) === 'normal') {
    genitourinaryNegatives.push('cambios de frecuencia urinaria');
  }
  const urinarySelections = formatOptionList(
    'sintomas_genitourinarios',
    asStringList(genitourinaryData.sintomas_genitourinarios),
  );
  genitourinaryPositives.push(...urinarySelections);
  items.push(formatSystemSummary('Genitourinario', genitourinaryPositives, genitourinaryNegatives, []));
  positiveFindings.push(...genitourinaryPositives.map((value) => `genitourinario: ${value}`));

  if (
    urinarySelections.length === 1 &&
    asBoolean(genitourinaryData.dolor_orinar) === false &&
    asString(genitourinaryData.frecuencia_urinaria) === 'normal'
  ) {
    qualityAlerts.push(
      `Hallazgo genitourinario aislado sin corroboracion del resto del interrogatorio: ${urinarySelections[0]}. Confirmar si es sintoma real o error de carga.`,
    );
  }

  return {
    section: {
      title: 'Interrogatorio dirigido por sistemas',
      items,
    },
    positiveFindings: unique(positiveFindings),
    qualityAlerts,
  };
}

function buildQualitySection(
  sectionMap: Map<string, AnamnesisSectionRecord>,
  complaint: ComplaintAnalysis,
  systems: SystemsAnalysis,
): AnamnesisSummarySection {
  const finalData = getSectionData(sectionMap, 'resumen_final');
  const complaintData = getSectionData(sectionMap, 'motivo_consulta');
  const intensity = asNumber(complaintData.intensidad_sintoma);
  const items: string[] = [];

  if (complaint.appearsContextual && complaint.rawComplaint) {
    items.push(
      'El texto cargado originalmente en motivo de consulta describe un contexto o desencadenante mas que un sintoma cardinal; la plataforma debe repreguntar antes de cerrar el triage.',
    );
  }

  if (complaint.repeatedNarrative) {
    items.push(
      `El mismo relato libre aparece en multiples campos ("${complaint.repeatedNarrative}"), lo que sugiere que el paciente no encontro un lugar adecuado para expresar su padecimiento principal.`,
    );
  }

  if (intensity != null && !complaint.dominantComplaint) {
    items.push('Hay intensidad consignada pero no un sintoma cardinal clinicamente interpretable al cual adjudicarla.');
  }

  if (complaint.dominantSource === 'comentarios_adicionales') {
    items.push(
      'La queja principal emerge recien en comentarios adicionales, al final del flujo, en lugar de estar estructurada desde la apertura del interrogatorio.',
    );
  }

  items.push(...systems.qualityAlerts);

  if (asBoolean(finalData.confirma_informacion) !== true) {
    items.push('La confirmacion final de veracidad del contenido no esta marcada como afirmativa.');
  }

  if (items.length === 0) {
    items.push('No se detectan incoherencias mecanicas evidentes en la carga, aunque el documento igualmente requiere validacion profesional.');
  }

  return {
    title: 'Alertas de calidad del relato digital',
    items,
  };
}

function buildPriorityQuestionsSection(
  complaint: ComplaintAnalysis,
  systems: SystemsAnalysis,
): AnamnesisSummarySection {
  const items: string[] = [];

  if (complaint.dominantComplaint) {
    items.push(
      `Precisar semiologia del sintoma cardinal ("${complaint.dominantComplaint}"): localizacion, caracter, irradiacion, forma de inicio, duracion, progresion, factores agravantes y atenuantes.`,
    );
  } else {
    items.push('Reconstruir desde cero la queja cardinal en lenguaje medico, porque el formulario no la recupera de manera confiable.');
  }

  items.push('Reconstruir cronologia clinica: que aparecio primero, como evoluciono y que desencadenantes o contextos se relacionan temporalmente con el cuadro.');
  items.push('Corroborar si hubo automedicacion, tratamientos previos, fiebre, banderas rojas neurologicas o digestivas y motivo exacto de consulta en este episodio.');

  if (systems.qualityAlerts.length > 0) {
    items.push('Repreguntar de manera dirigida los hallazgos aislados o potencialmente espurios antes de incorporarlos como datos firmes a la historia clinica.');
  }

  if (systems.positiveFindings.length > 0) {
    items.push(`Jerarquizar que sintomas asociados son verdaderamente concomitantes al cuadro principal y cuales son respuestas accesorias del interrogatorio por sistemas.`);
  }

  return {
    title: 'Repreguntas clinicas prioritarias',
    items,
  };
}

function buildNarrativeLead(
  sectionMap: Map<string, AnamnesisSectionRecord>,
  complaint: ComplaintAnalysis,
  systems: SystemsAnalysis,
): string[] {
  const complaintData = getSectionData(sectionMap, 'motivo_consulta');
  const diseasesData = getSectionData(sectionMap, 'enfermedades_previas');
  const medicationsData = getSectionData(sectionMap, 'medicamentos');
  const allergiesData = getSectionData(sectionMap, 'alergias');
  const habitsData = getSectionData(sectionMap, 'habitos');

  const items: string[] = [];

  appendItem(
    items,
    complaint.dominantComplaint
      ? `Queja cardinal reconstruida: "${complaint.dominantComplaint}".`
      : 'No se logra definir una queja cardinal clinicamente util a partir del formulario.',
  );
  appendItem(
    items,
    formatOptionValue('cuando_empezo', asString(complaintData.cuando_empezo))
      ? `Tiempo de evolucion referido: ${formatOptionValue('cuando_empezo', asString(complaintData.cuando_empezo))}.`
      : null,
  );
  appendItem(
    items,
    asNumber(complaintData.intensidad_sintoma) != null
      ? `Intensidad subjetiva consignada: ${asNumber(complaintData.intensidad_sintoma)}/10.`
      : null,
  );

  const chronicDiseases = formatOptionList(
    'enfermedades_cronicas',
    asStringList(diseasesData.enfermedades_cronicas),
  );
  appendItem(
    items,
    chronicDiseases.length > 0
      ? `Antecedentes patologicos relevantes: ${joinList(chronicDiseases)}.`
      : 'No se consignan antecedentes cronicos relevantes en las opciones relevadas.',
  );

  const medicationList = asString(medicationsData.lista_medicamentos);
  if (asBoolean(medicationsData.toma_medicamentos) === true) {
    appendItem(
      items,
      medicationList
        ? `Medicacion habitual: ${medicationList}.`
        : 'Refiere medicacion habitual sin detalle.',
    );
  } else if (asBoolean(medicationsData.toma_medicamentos) === false) {
    appendItem(items, 'Niega medicacion actual.');
  }

  const allergyList = asString(allergiesData.lista_alergias);
  if (asBoolean(allergiesData.tiene_alergias) === true) {
    appendItem(
      items,
      allergyList
        ? `Alergias referidas: ${allergyList}.`
        : 'Refiere alergias sin caracterizacion clinica.',
    );
  } else if (asBoolean(allergiesData.tiene_alergias) === false) {
    appendItem(items, 'Niega alergias conocidas.');
  }

  const smoking = formatOptionValue('fuma', asString(habitsData.fuma));
  const alcohol = formatOptionValue('alcohol', asString(habitsData.alcohol));
  const exercise = formatOptionValue('ejercicio', asString(habitsData.ejercicio));
  const habitsSummary = joinList([smoking, alcohol, exercise].filter((value): value is string => value != null));
  appendItem(items, habitsSummary ? `Habitos relevantes: ${habitsSummary}.` : null);

  appendItem(
    items,
    systems.positiveFindings.length > 0
      ? `Positivos del interrogatorio dirigido: ${joinList(systems.positiveFindings)}.`
      : 'Sin positivos claros de interrogatorio dirigido, o con informacion insuficiente para jerarquizarlos.',
  );

  if (complaint.repeatedNarrative) {
    appendItem(
      items,
      'La carga digital muestra reiteracion del mismo relato en distintos campos, dato que obliga a validar de nuevo la anamnesis con entrevista profesional.',
    );
  }

  return items;
}

export function buildAnamnesisSummary(sections: AnamnesisSectionRecord[]): AnamnesisSummary {
  const sectionMap = buildSectionMap(sections);
  const complaint = buildComplaintAnalysis(sectionMap);
  const systems = buildSystemsSection(sectionMap, complaint);

  const structuredSections = [
    buildPersonalDataSection(sectionMap),
    buildReasonSection(sectionMap, complaint),
    buildCurrentIllnessSection(sectionMap, complaint, systems),
    buildPhysiologicalBackgroundSection(sectionMap),
    buildPathologicalBackgroundSection(sectionMap),
    buildHabitsSection(sectionMap),
    buildFamilySection(sectionMap),
    systems.section,
    buildQualitySection(sectionMap, complaint, systems),
    buildPriorityQuestionsSection(complaint, systems),
  ].filter((section) => section.items.length > 0);

  const lastUpdatedAt = sections.reduce<string | null>((latest, section) => {
    if (!section.updated_at) return latest;
    if (!latest) return section.updated_at;
    return new Date(section.updated_at).getTime() > new Date(latest).getTime() ? section.updated_at : latest;
  }, null);

  return {
    headline:
      'Anamnesis clinica estructurada generada automaticamente a partir de respuestas del paciente. Es un documento preliminar: debe validarse, completarse y jerarquizarse en la entrevista profesional.',
    narrative: buildNarrativeLead(sectionMap, complaint, systems),
    sections: structuredSections,
    completedSections: sections.filter((section) => section.completed === true).length,
    lastUpdatedAt,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return 'Sin registro';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(date);
}

export function buildAnamnesisExportHtml(input: {
  patientLabel: string;
  status: string;
  privacyAccepted: boolean;
  summary: AnamnesisSummary;
}): string {
  const generatedAt = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());

  const sectionsHtml = input.summary.sections
    .map(
      (section) => `
        <section class="section">
          <h2>${escapeHtml(section.title)}</h2>
          <ul>
            ${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </section>
      `,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Anamnesis clinica estructurada</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif;
      }
      body {
        margin: 0;
        padding: 32px;
        background: #f5f1e8;
        color: #1c1917;
      }
      .page {
        max-width: 980px;
        margin: 0 auto;
        background: #ffffff;
        border-radius: 20px;
        padding: 36px;
        box-shadow: 0 18px 40px rgba(28, 25, 23, 0.08);
      }
      .actions {
        display: flex;
        gap: 12px;
        margin-bottom: 24px;
      }
      .actions button {
        border: 0;
        border-radius: 999px;
        padding: 10px 16px;
        cursor: pointer;
        background: #0f766e;
        color: white;
        font-weight: 600;
      }
      .actions button.secondary {
        background: #e7e5e4;
        color: #1c1917;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        padding: 6px 12px;
        border-radius: 999px;
        background: #fef3c7;
        color: #92400e;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      h1 {
        margin: 16px 0 8px;
        font-size: 34px;
        line-height: 1.1;
      }
      .lede {
        margin: 0 0 24px;
        font-size: 17px;
        line-height: 1.6;
        color: #44403c;
      }
      .meta {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 12px;
        margin: 24px 0 28px;
      }
      .meta-card {
        border: 1px solid #e7e5e4;
        border-radius: 14px;
        padding: 14px 16px;
        background: #fafaf9;
      }
      .meta-card strong {
        display: block;
        margin-bottom: 6px;
        color: #57534e;
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .summary {
        border: 1px solid #cbd5e1;
        border-left: 5px solid #0f766e;
        padding: 20px 22px;
        background: #f8fafc;
        border-radius: 16px;
        margin-bottom: 28px;
      }
      .summary h2 {
        margin: 0 0 12px;
        font-size: 20px;
      }
      .section {
        margin-top: 22px;
        padding-top: 22px;
        border-top: 1px solid #e7e5e4;
      }
      .section h2 {
        margin: 0 0 14px;
        font-size: 22px;
      }
      ul {
        margin: 0;
        padding-left: 22px;
      }
      li {
        margin-bottom: 10px;
        line-height: 1.55;
      }
      .footer-note {
        margin-top: 28px;
        padding-top: 20px;
        border-top: 1px dashed #d6d3d1;
        color: #57534e;
        font-size: 14px;
        line-height: 1.5;
      }
      @media print {
        body {
          background: white;
          padding: 0;
        }
        .page {
          box-shadow: none;
          border-radius: 0;
          padding: 0;
        }
        .actions {
          display: none;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="actions">
        <button onclick="window.print()">Imprimir / guardar como PDF</button>
        <button class="secondary" onclick="window.close()">Cerrar</button>
      </div>

      <span class="eyebrow">Documento preliminar</span>
      <h1>Anamnesis clinica estructurada</h1>
      <p class="lede">${escapeHtml(input.summary.headline)}</p>

      <div class="meta">
        <div class="meta-card"><strong>Paciente</strong>${escapeHtml(input.patientLabel)}</div>
        <div class="meta-card"><strong>Estado</strong>${escapeHtml(input.status)}</div>
        <div class="meta-card"><strong>Compartida con medicos</strong>${input.privacyAccepted ? 'Si' : 'No'}</div>
        <div class="meta-card"><strong>Ultima actualizacion</strong>${escapeHtml(formatTimestamp(input.summary.lastUpdatedAt))}</div>
        <div class="meta-card"><strong>Generado</strong>${escapeHtml(generatedAt)}</div>
      </div>

      <section class="summary">
        <h2>Sintesis de orientacion clinica</h2>
        <ul>
          ${input.summary.narrative.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </section>

      ${sectionsHtml}

      <section class="footer-note">
        Este documento no reemplaza la entrevista clinica presencial ni constituye por si solo una historia clinica completa. Su utilidad depende de que un profesional valide la informacion, complete los antecedentes no relevados por el flujo digital y reorganice los datos segun semiologia medica.
      </section>
    </main>
  </body>
</html>`;
}
