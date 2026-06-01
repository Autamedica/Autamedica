import { ArrowRight, Clock, MapPin, Video, type LucideIcon } from 'lucide-react'
import type { AppointmentType } from '@/lib/patients/types/appointment'

export function toLocalYmd(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getWeekRange(baseDate: Date): { from: string; to: string } {
  const day = baseDate.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(baseDate)
  monday.setDate(baseDate.getDate() + diffToMonday)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  return {
    from: toLocalYmd(monday),
    to: toLocalYmd(sunday),
  }
}

export function formatDayShort(dateStr: string): { weekday: string; day: string } {
  const d = new Date(dateStr + 'T12:00:00')
  return {
    weekday: d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', ''),
    day: d.toLocaleDateString('es-AR', { day: 'numeric' }),
  }
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function getDaysInRange(from: string, to: string): string[] {
  const days: string[] = []
  const current = new Date(from + 'T12:00:00')
  const end = new Date(to + 'T12:00:00')
  while (current <= end) {
    days.push(toLocalYmd(current))
    current.setDate(current.getDate() + 1)
  }
  return days
}

export const APPOINTMENT_TYPES: { value: AppointmentType; label: string; icon: LucideIcon; desc: string }[] = [
  { value: 'telemedicine', label: 'Telemedicina', icon: Video, desc: 'Consulta por videollamada' },
  { value: 'consultation', label: 'Presencial', icon: MapPin, desc: 'Consulta en consultorio' },
  { value: 'follow_up', label: 'Control de continuidad', icon: ArrowRight, desc: 'Revisión y renovación' },
  { value: 'emergency', label: 'Urgencia', icon: Clock, desc: 'Atención prioritaria' },
]
