const STORAGE_PREFIX = 'autamedica:doctor-call-notes:'

export interface ConsultationNotesDraft {
  notes: string
  updatedAt: string
}

export function getConsultationNotesDraftKey(roomId: string): string {
  return `${STORAGE_PREFIX}${roomId}`
}

export function readConsultationNotesDraft(roomId: string): ConsultationNotesDraft | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(getConsultationNotesDraftKey(roomId))
    if (!raw) return null

    const parsed = JSON.parse(raw) as Partial<ConsultationNotesDraft>
    if (typeof parsed.notes !== 'string' || typeof parsed.updatedAt !== 'string') {
      return null
    }

    return {
      notes: parsed.notes,
      updatedAt: parsed.updatedAt,
    }
  } catch {
    return null
  }
}

export function writeConsultationNotesDraft(roomId: string, draft: ConsultationNotesDraft): void {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(
    getConsultationNotesDraftKey(roomId),
    JSON.stringify(draft),
  )
}

export function clearConsultationNotesDraft(roomId: string): void {
  if (typeof window === 'undefined') return

  window.localStorage.removeItem(getConsultationNotesDraftKey(roomId))
}
