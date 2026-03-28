import { BodyMapSelectionsSchema } from '@/lib/patients/lib/zod/anamnesis-extraction'
import type { BodyMapSelection } from '@/lib/patients/types/anamnesis'
import type { AnamnesisSectionRecord } from '@/lib/patients/types/anamnesis-extraction'
import { isJsonObject } from './extraction-parser'

export function deduplicateBodySelections(
  selections: BodyMapSelection[],
): BodyMapSelection[] {
  const deduplicated = new Map<string, BodyMapSelection>()

  for (const selection of selections) {
    deduplicated.set(selection.partId, selection)
  }

  return Array.from(deduplicated.values())
}

export function extractBodySelectionsFromSections(
  sections: AnamnesisSectionRecord[],
): BodyMapSelection[] {
  const collected: BodyMapSelection[] = []

  for (const section of sections) {
    if (!isJsonObject(section.data)) {
      continue
    }

    for (const key of ['body_selections', 'bodySelections']) {
      const candidate = section.data[key]
      const parsed = BodyMapSelectionsSchema.safeParse(candidate)
      if (parsed.success) {
        collected.push(...(parsed.data as BodyMapSelection[]))
      }
    }
  }

  return deduplicateBodySelections(collected)
}
