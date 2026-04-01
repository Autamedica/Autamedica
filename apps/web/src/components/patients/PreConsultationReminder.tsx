'use client'

import { Check, Camera, Wifi, FileText, Clock, Lightbulb } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'

interface PreConsultationReminderProps {
  doctorName: string
  specialty: string
  scheduledAt: string
  appointmentId: string
  locale?: string
}

interface ChecklistItem {
  id: string
  label: string
  icon: typeof Wifi
  href?: string
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { id: 'wifi', label: 'Verific\u00e1 tu conexi\u00f3n a internet', icon: Wifi },
  { id: 'camera', label: 'Prob\u00e1 tu c\u00e1mara y micr\u00f3fono', icon: Camera, href: '/patients/test-camera' },
  { id: 'docs', label: 'Ten\u00e9 a mano estudios o recetas recientes', icon: FileText },
  { id: 'place', label: 'Busc\u00e1 un lugar tranquilo y bien iluminado', icon: Lightbulb },
]

function getStorageKey(appointmentId: string) {
  return `au-preconsult-${appointmentId}`
}

function loadChecked(appointmentId: string): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(getStorageKey(appointmentId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveChecked(appointmentId: string, checked: Record<string, boolean>) {
  try {
    sessionStorage.setItem(getStorageKey(appointmentId), JSON.stringify(checked))
  } catch {
    // sessionStorage full or unavailable
  }
}

function formatCountdown(diffMs: number): string {
  if (diffMs <= 0) return 'ahora'
  const totalMin = Math.floor(diffMs / 60_000)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  if (hours > 0 && mins > 0) return `${hours}h ${mins}min`
  if (hours > 0) return `${hours}h`
  return `${mins}min`
}

export default function PreConsultationReminder({
  doctorName,
  specialty,
  scheduledAt,
  appointmentId,
  locale: _locale = 'es-AR',
}: PreConsultationReminderProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [diffMs, setDiffMs] = useState(() => new Date(scheduledAt).getTime() - Date.now())

  useEffect(() => {
    setChecked(loadChecked(appointmentId))
  }, [appointmentId])

  useEffect(() => {
    const tick = () => setDiffMs(new Date(scheduledAt).getTime() - Date.now())
    tick()
    const id = setInterval(tick, 60_000)
    return () => clearInterval(id)
  }, [scheduledAt])

  const toggle = useCallback((itemId: string) => {
    setChecked(prev => {
      const next = { ...prev, [itemId]: !prev[itemId] }
      saveChecked(appointmentId, next)
      return next
    })
  }, [appointmentId])

  if (diffMs <= 0 || diffMs > 2 * 60 * 60 * 1000) return null

  const checkedCount = CHECKLIST_ITEMS.filter(i => checked[i.id]).length
  const allDone = checkedCount === CHECKLIST_ITEMS.length
  const isUrgent = diffMs <= 30 * 60 * 1000

  const bgClass = isUrgent
    ? 'bg-amber-50 border-amber-200'
    : 'bg-sky-50 border-sky-200'

  const countdownColor = isUrgent ? 'text-amber-700' : 'text-sky-700'

  return (
    <section className={`mb-6 rounded-2xl border p-5 ${bgClass} transition-colors duration-500`}>
      {/* Countdown + doctor info */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <Clock className={`h-4 w-4 ${countdownColor}`} />
          <span className={`text-sm font-bold ${countdownColor}`}>
            Tu consulta empieza en {formatCountdown(diffMs)}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          {doctorName} &middot; {specialty}
        </p>
      </div>

      {/* Checklist */}
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
        Preparate para la consulta
      </p>
      <ul className="space-y-2.5">
        {CHECKLIST_ITEMS.map(item => {
          const isChecked = !!checked[item.id]
          const Icon = item.icon
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => toggle(item.id)}
                className="flex w-full items-center gap-3 text-left transition-opacity duration-200"
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all duration-200 ${
                    isChecked
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isChecked && <Check className="h-3 w-3" />}
                </div>
                <Icon className={`h-4 w-4 shrink-0 ${isChecked ? 'text-gray-400' : 'text-gray-500'}`} />
                <span className={`text-sm transition-all duration-200 ${isChecked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                  {item.href ? (
                    <a
                      href={item.href}
                      onClick={e => e.stopPropagation()}
                      className="underline decoration-dotted underline-offset-2 hover:text-sky-600"
                    >
                      {item.label}
                    </a>
                  ) : (
                    item.label
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {/* Progress / badge */}
      <div className="mt-4">
        {allDone ? (
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
            <Check className="h-3.5 w-3.5" />
            Est\u00e1s listo
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            {checkedCount} de {CHECKLIST_ITEMS.length} completados
          </p>
        )}
      </div>
    </section>
  )
}
