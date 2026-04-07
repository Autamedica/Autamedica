import type {
  AnamnesisHistoricalContext,
  AnamnesisHistoricalEpisode,
  AnamnesisSectionRecord,
} from '@/lib/patients/types/anamnesis-extraction'

interface VersionSectionSnapshot {
  section: string
  data: Record<string, unknown>
  completed?: boolean | null
}

export interface HistoricalVersionInput {
  versionNumber: number
  createdAt: string
  notes: string | null
  relevance: string | null
  sectionsSnapshot?: VersionSectionSnapshot[] | null
  extractionSnapshot?: Record<string, unknown> | null
}

interface EpisodeProfile {
  chiefComplaint: string | null
  complaintTokens: string[]
  systems: string[]
  chronicConditions: string[]
  medications: string[]
  allergies: string[]
  combinedText: string
}

const STOPWORDS = new Set([
  'ante',
  'ayer',
  'bien',
  'cada',
  'cara',
  'como',
  'consulta',
  'desde',
  'dias',
  'dia',
  'donde',
  'dolor',
  'esta',
  'este',
  'esto',
  'estoy',
  'hace',
  'hoy',
  'luego',
  'mal',
  'meses',
  'mes',
  'molestia',
  'mucha',
  'mucho',
  'para',
  'pero',
  'poco',
  'porque',
  'presenta',
  'semanas',
  'semana',
  'siento',
  'solo',
  'tener',
  'tengo',
  'tipo',
  'varios',
])

const SPANISH_SYSTEM_LABELS = {
  cardiovascular: 'cardiovascular',
  respiratory: 'respiratorio',
  digestive: 'digestivo',
  genitourinary: 'genitourinario',
  neurologic: 'neurologico',
  musculoskeletal: 'musculoesqueletico',
  skin: 'piel',
  constitutional: 'general',
} as const

const SYSTEM_KEYWORDS: Array<{ system: keyof typeof SPANISH_SYSTEM_LABELS; keywords: string[] }> = [
  {
    system: 'cardiovascular',
    keywords: ['angina', 'brazo', 'cardiac', 'cardio', 'corazon', 'edema', 'opres', 'palpit', 'precord', 'taquic'],
  },
  {
    system: 'respiratory',
    keywords: ['aire', 'bronco', 'disnea', 'hemopt', 'pecho', 'pleura', 'pleurit', 'pulmon', 'respir', 'sibil', 'tos', 'torac'],
  },
  {
    system: 'digestive',
    keywords: ['abdomen', 'abdominal', 'acidez', 'diar', 'digest', 'epigas', 'estomac', 'heces', 'melena', 'nause', 'reflu', 'vomit'],
  },
  {
    system: 'genitourinary',
    keywords: ['disuria', 'flanco', 'genit', 'hematur', 'orina', 'pelv', 'renal', 'urin', 'vaginal'],
  },
  {
    system: 'neurologic',
    keywords: ['aura', 'cefalea', 'convuls', 'mareo', 'migra', 'neuro', 'parest', 'vertig'],
  },
  {
    system: 'musculoskeletal',
    keywords: ['articul', 'columna', 'contract', 'espalda', 'hombro', 'muscul', 'rodilla', 'tobillo'],
  },
  {
    system: 'skin',
    keywords: ['alas', 'cutan', 'derma', 'erup', 'lesion', 'malar', 'mancha', 'mariposa', 'piel', 'rash', 'roncha'],
  },
  {
    system: 'constitutional',
    keywords: ['astenia', 'cansancio', 'escalofr', 'fiebre', 'fatiga', 'peso', 'sudor'],
  },
]

const CHRONIC_THREAD_RULES = [
  {
    aliases: ['lupus', 'les', 'lupico', 'autoinmune'],
    keywords: ['alas', 'articul', 'fotosens', 'malar', 'mariposa', 'pleura', 'pleurit', 'rash', 'serositis'],
    label: 'continuidad con enfermedad cronica sistemica',
  },
  {
    aliases: ['asma'],
    keywords: ['bronco', 'disnea', 'sibil', 'tos'],
    label: 'continuidad con asma',
  },
  {
    aliases: ['diabetes'],
    keywords: ['gluc', 'hipogluc', 'neuropat', 'pie', 'polidips', 'poliur', 'vision'],
    label: 'continuidad con diabetes',
  },
  {
    aliases: ['epileps', 'convuls'],
    keywords: ['aura', 'conciencia', 'convuls', 'crisis'],
    label: 'continuidad con epilepsia',
  },
  {
    aliases: ['hepatitis'],
    keywords: ['acolia', 'coluria', 'hepatic', 'icter', 'hipocond'],
    label: 'continuidad con hepatitis',
  },
  {
    aliases: ['tiroid', 'hipotiroid', 'hipertiroid'],
    keywords: ['calor', 'cansancio', 'fatiga', 'frio', 'palpit', 'peso'],
    label: 'continuidad con enfermedad tiroidea',
  },
]

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function splitFreeTextList(value: string): string[] {
  return value
    .split(/\r?\n|;|,/)
    .map((item) => item.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') {
    return splitFreeTextList(value)
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings)
  }
  if (isRecord(value)) {
    return Object.values(value).flatMap(collectStrings)
  }
  return []
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = normalizeText(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function tokenize(value: string | null): string[] {
  if (!value) return []
  return normalizeText(value)
    .split(' ')
    .filter(token => token.length >= 4 && !STOPWORDS.has(token))
}

function getSectionMap(sections: Array<{ section: string; data: Record<string, unknown> }>): Map<string, Record<string, unknown>> {
  return new Map(sections.map(section => [section.section, section.data]))
}

function getSectionStrings(
  sectionMap: Map<string, Record<string, unknown>>,
  section: string,
  field: string,
): string[] {
  const data = sectionMap.get(section)
  if (!data) return []
  return uniqueStrings(collectStrings(data[field]))
}

function getExtractionRecord(snapshot: Record<string, unknown> | null | undefined, key: string): Record<string, unknown> | null {
  if (!snapshot || !isRecord(snapshot[key])) return null
  return snapshot[key] as Record<string, unknown>
}

function getExtractionStrings(snapshot: Record<string, unknown> | null | undefined, path: string[]): string[] {
  let current: unknown = snapshot
  for (const segment of path) {
    if (!isRecord(current)) return []
    current = current[segment]
  }
  return uniqueStrings(collectStrings(current))
}

function detectSystems(texts: string[]): string[] {
  const normalized = normalizeText(texts.join(' '))
  const systems = SYSTEM_KEYWORDS
    .filter(({ keywords }) => keywords.some(keyword => normalized.includes(keyword)))
    .map(({ system }) => SPANISH_SYSTEM_LABELS[system])
  return uniqueStrings(systems)
}

function buildProfile(
  sections: Array<{ section: string; data: Record<string, unknown> }>,
  extractionSnapshot?: Record<string, unknown> | null,
  notes?: string | null,
): EpisodeProfile {
  const sectionMap = getSectionMap(sections)
  const sectionComplaint = asString(sectionMap.get('motivo_consulta')?.sintoma_principal)
  const extractionComplaint = asString(getExtractionRecord(extractionSnapshot, 'chiefComplaint')?.rawText)
    ?? asString(getExtractionRecord(extractionSnapshot, 'chiefComplaint')?.normalizedMedicalText)
  const chiefComplaint = sectionComplaint ?? extractionComplaint ?? asString(notes)

  const chronicConditions = uniqueStrings([
    ...getSectionStrings(sectionMap, 'enfermedades_previas', 'enfermedades_cronicas'),
    ...getExtractionStrings(extractionSnapshot, ['personalHistory', 'pathological']),
  ])

  const medications = uniqueStrings(getSectionStrings(sectionMap, 'medicamentos', 'lista_medicamentos'))
  const allergies = uniqueStrings(getSectionStrings(sectionMap, 'alergias', 'lista_alergias'))

  const narrativeTexts = uniqueStrings([
    chiefComplaint ?? '',
    ...getExtractionStrings(extractionSnapshot, ['presentIllness', 'clinicalNarrative']),
    ...(notes ? [notes] : []),
  ])

  const systems = detectSystems([
    ...narrativeTexts,
    ...chronicConditions,
    ...getExtractionStrings(extractionSnapshot, ['reviewOfSystems', 'cardiovascular']),
    ...getExtractionStrings(extractionSnapshot, ['reviewOfSystems', 'respiratory']),
    ...getExtractionStrings(extractionSnapshot, ['reviewOfSystems', 'digestive']),
    ...getExtractionStrings(extractionSnapshot, ['reviewOfSystems', 'genitourinary']),
  ])

  return {
    chiefComplaint,
    complaintTokens: tokenize(chiefComplaint),
    systems,
    chronicConditions,
    medications,
    allergies,
    combinedText: normalizeText([
      ...narrativeTexts,
      ...chronicConditions,
      ...medications,
      ...allergies,
    ].join(' ')),
  }
}

function scoreRelation(
  current: EpisodeProfile,
  previous: EpisodeProfile,
  previousRelevance: string | null,
): Pick<AnamnesisHistoricalEpisode, 'relationScore' | 'relationReasons' | 'relatedSystems'> | null {
  let score = 0
  const reasons: string[] = []

  const complaintOverlap = current.complaintTokens.filter(token => previous.complaintTokens.includes(token))
  if (complaintOverlap.length > 0) {
    score += Math.min(4, complaintOverlap.length * 2)
    reasons.push(`solapamiento semiologico: ${uniqueStrings(complaintOverlap).slice(0, 3).join(', ')}`)
  }

  const relatedSystems = current.systems.filter(system => previous.systems.includes(system))
  if (relatedSystems.length > 0) {
    score += 2
    reasons.push(`mismo eje clinico: ${uniqueStrings(relatedSystems).join(', ')}`)
  }

  const sharedConditions = current.chronicConditions.filter(condition => {
    const normalized = normalizeText(condition)
    return previous.chronicConditions.some(previousCondition => {
      const previousNormalized = normalizeText(previousCondition)
      return normalized === previousNormalized
        || normalized.includes(previousNormalized)
        || previousNormalized.includes(normalized)
    })
  })
  if (sharedConditions.length > 0) {
    score += 4
    reasons.push(`antecedente cronico compartido: ${uniqueStrings(sharedConditions).slice(0, 2).join(', ')}`)
  }

  const threadMatches = CHRONIC_THREAD_RULES
    .filter(rule =>
      previous.chronicConditions.some(condition => {
        const normalizedCondition = normalizeText(condition)
        return rule.aliases.some(alias => normalizedCondition.includes(alias))
      }) && rule.keywords.some(keyword => current.combinedText.includes(keyword)),
    )
    .map(rule => rule.label)

  if (threadMatches.length > 0) {
    score += 4
    reasons.push(uniqueStrings(threadMatches).join(', '))
  }

  if (previousRelevance === 'follow_up') {
    score += 1
    reasons.push('version previa marcada como seguimiento')
  }

  if (score < 3) {
    return null
  }

  return {
    relationScore: score,
    relationReasons: uniqueStrings(reasons),
    relatedSystems: uniqueStrings(relatedSystems),
  }
}

function selectLatestNonEmpty(
  versions: HistoricalVersionInput[],
  selector: (version: HistoricalVersionInput) => string[],
): { values: string[]; sourceVersionNumber: number | null } {
  for (const version of versions) {
    const values = uniqueStrings(selector(version))
    if (values.length > 0) {
      return {
        values,
        sourceVersionNumber: version.versionNumber,
      }
    }
  }

  return {
    values: [],
    sourceVersionNumber: null,
  }
}

export function buildHistoricalContext(input: {
  currentSections: AnamnesisSectionRecord[]
  versions: HistoricalVersionInput[]
  maxRelatedEpisodes?: number
}): AnamnesisHistoricalContext | null {
  if (input.versions.length === 0) {
    return null
  }

  const maxRelatedEpisodes = input.maxRelatedEpisodes ?? 3
  const sortedVersions = [...input.versions].sort((left, right) => right.versionNumber - left.versionNumber)
  const currentProfile = buildProfile(
    input.currentSections.map(section => ({
      section: section.section,
      data: isRecord(section.data) ? section.data : {},
    })),
  )

  const globalContext = {
    chronicConditions: selectLatestNonEmpty(sortedVersions, version =>
      buildProfile(version.sectionsSnapshot ?? [], version.extractionSnapshot, version.notes).chronicConditions),
    medications: selectLatestNonEmpty(sortedVersions, version =>
      buildProfile(version.sectionsSnapshot ?? [], version.extractionSnapshot, version.notes).medications),
    allergies: selectLatestNonEmpty(sortedVersions, version =>
      buildProfile(version.sectionsSnapshot ?? [], version.extractionSnapshot, version.notes).allergies),
  }

  const relatedEpisodes = sortedVersions
    .map((version) => {
      const previousProfile = buildProfile(version.sectionsSnapshot ?? [], version.extractionSnapshot, version.notes)
      const relation = scoreRelation(currentProfile, previousProfile, version.relevance)
      if (!relation) return null

      return {
        versionNumber: version.versionNumber,
        createdAt: version.createdAt,
        chiefComplaint: previousProfile.chiefComplaint,
        chronicConditions: previousProfile.chronicConditions,
        relatedSystems: relation.relatedSystems,
        relationScore: relation.relationScore,
        relationReasons: relation.relationReasons,
        notes: version.notes,
      } satisfies AnamnesisHistoricalEpisode
    })
    .filter((episode): episode is AnamnesisHistoricalEpisode => episode !== null)
    .slice(0, maxRelatedEpisodes)

  const hasGlobalContext = globalContext.chronicConditions.values.length > 0
    || globalContext.medications.values.length > 0
    || globalContext.allergies.values.length > 0

  if (!hasGlobalContext && relatedEpisodes.length === 0) {
    return null
  }

  return {
    globalContext: hasGlobalContext ? globalContext : null,
    relatedEpisodes,
  }
}
