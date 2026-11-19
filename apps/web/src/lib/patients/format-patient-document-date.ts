export function formatPatientDocumentDate(value: string | null, locale: string): string {
  const emptyLabel = locale === 'pt-BR' ? 'Sem data' : 'Sin fecha'
  if (!value) return emptyLabel

  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  let parsed: Date

  if (dateOnly) {
    // Clinical document dates are calendar days, not UTC instants.
    // Constructing a local date prevents YYYY-MM-DD from shifting back one
    // day when rendered in Brazil or Argentina.
    const year = Number(dateOnly[1])
    const month = Number(dateOnly[2])
    const day = Number(dateOnly[3])
    parsed = new Date(year, month - 1, day)
    if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) {
      return emptyLabel
    }
  } else {
    parsed = new Date(value)
  }

  if (!Number.isFinite(parsed.getTime())) return emptyLabel
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(parsed)
}
