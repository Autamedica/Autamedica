const APP_TIME_ZONE = 'America/Argentina/Buenos_Aires'
const ARGENTINA_UTC_OFFSET = '-03:00'

export function localDateTimeInputToIso(date: string, time: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)

  if (
    !Number.isInteger(year)
    || !Number.isInteger(month)
    || !Number.isInteger(day)
    || !Number.isInteger(hour)
    || !Number.isInteger(minute)
  ) {
    throw new Error('invalid_local_datetime')
  }

  return new Date(
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00${ARGENTINA_UTC_OFFSET}`,
  ).toISOString()
}

export function localDateInput(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function isPastAppointmentStart(value: string, now = new Date()): boolean {
  const parsed = new Date(value)
  const timestamp = parsed.getTime()
  return Number.isFinite(timestamp) && timestamp <= now.getTime()
}
