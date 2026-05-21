"use client"

import { useCallback, useEffect, useState } from 'react'
import { Clock, Save, Trash2, Plus, AlertCircle, CheckCircle2, Settings2 } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'

const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const
const DAY_FULL_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

interface TimeSlot {
  dayOfWeek: number
  startTime: string
  endTime: string
  slotDuration: number
  location?: string | null
}

interface WeeklySlotRow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  slot_duration: number
  location: string | null
  is_active: boolean
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function normalizeTime(t: string): string {
  // "09:00:00" → "09:00"
  return t.slice(0, 5)
}



export function AvailabilityEditor() {
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  // Fetch current availability
  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true)
      const data = await fetchApi<{ weekly?: WeeklySlotRow[] }>('/api/doctors/availability')
      const weekly = data.weekly ?? []

      // Detect fake 24/7 preset
      const isFake = weekly.length >= 7 && weekly.every(
        s => s.start_time === '00:00:00' && s.end_time === '23:59:00',
      )

      if (isFake || weekly.length === 0) {
        setSlots([])
        setIsOpen(true) // Auto-open if no real availability
      } else {
        setSlots(weekly.map(s => ({
          dayOfWeek: s.day_of_week,
          startTime: normalizeTime(s.start_time),
          endTime: normalizeTime(s.end_time),
          slotDuration: s.slot_duration,
          location: s.location,
        })))
      }
    } catch {
      setErrorMsg('No se pudo cargar la disponibilidad')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchSchedule() }, [fetchSchedule])

  // Save
  const handleSave = async () => {
    if (slots.length === 0) {
      setErrorMsg('Agregá al menos un bloque horario')
      return
    }
    // Validate
    for (const slot of slots) {
      if (slot.startTime >= slot.endTime) {
        setErrorMsg(`${DAY_FULL_LABELS[slot.dayOfWeek]}: la hora de inicio debe ser anterior a la de fin`)
        return
      }
    }

    try {
      setSaveStatus('saving')
      setErrorMsg('')
      await fetchApi('/api/doctors/availability', {
        method: 'PUT',
        body: { slots },
      })
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch (err) {
      setSaveStatus('error')
      setErrorMsg((err as Error).message)
    }
  }

  // Add slot for a specific day
  const addSlot = (day: number) => {
    setSlots(prev => [...prev, {
      dayOfWeek: day,
      startTime: '09:00',
      endTime: '17:00',
      slotDuration: 30,
    }])
    setSaveStatus('idle')
  }

  // Remove slot
  const removeSlot = (index: number) => {
    setSlots(prev => prev.filter((_, i) => i !== index))
    setSaveStatus('idle')
  }

  // Update slot field
  const updateSlot = (index: number, field: keyof TimeSlot, value: string | number) => {
    setSlots(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
    setSaveStatus('idle')
    setErrorMsg('')
  }

  // Quick template: apply common schedule
  const applyTemplate = (template: 'weekdays' | 'weekdays_half') => {
    const days = [1, 2, 3, 4, 5] // Lun-Vie
    const newSlots: TimeSlot[] = days.map(d => ({
      dayOfWeek: d,
      startTime: template === 'weekdays_half' ? '08:00' : '09:00',
      endTime: template === 'weekdays_half' ? '13:00' : '18:00',
      slotDuration: 30,
    }))
    setSlots(newSlots)
    setSaveStatus('idle')
  }

  const hasSlots = slots.length > 0

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm p-5">
        <div className="flex items-center gap-3 justify-center py-8 opacity-40">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-am-doctor-500 border-t-transparent" />
          <span className="text-xs font-medium text-neutral-400">Cargando disponibilidad...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-neutral-200/60 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between border-b border-neutral-100 px-5 py-4 hover:bg-neutral-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${hasSlots ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            {hasSlots ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          </div>
          <div className="text-left">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-400">Disponibilidad</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {hasSlots
                ? `${slots.length} bloque${slots.length > 1 ? 's' : ''} configurado${slots.length > 1 ? 's' : ''}`
                : 'Sin horarios configurados — los pacientes no pueden agendar turnos'}
            </p>
          </div>
        </div>
        <Settings2 className={`h-4 w-4 text-neutral-300 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {/* Body */}
      {isOpen && (
        <div className="p-5">
          {/* Alert if no availability */}
          {!hasSlots && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-bold text-amber-800">Configurá tu disponibilidad</p>
                <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                  Sin horarios configurados, los pacientes no pueden verte ni agendar turnos.
                  Elegí una plantilla rápida o agregá bloques manualmente.
                </p>
              </div>
            </div>
          )}

          {/* Quick templates */}
          {!hasSlots && (
            <div className="mb-5 flex flex-wrap gap-2">
              <button
                onClick={() => applyTemplate('weekdays')}
                className="rounded-lg bg-am-doctor-50 px-3 py-2 text-xs font-bold text-am-doctor-700 ring-1 ring-am-doctor-100 hover:bg-am-doctor-100 transition"
              >
                📅 Lun-Vie 9:00-18:00
              </button>
              <button
                onClick={() => applyTemplate('weekdays_half')}
                className="rounded-lg bg-am-doctor-50 px-3 py-2 text-xs font-bold text-am-doctor-700 ring-1 ring-am-doctor-100 hover:bg-am-doctor-100 transition"
              >
                🌅 Lun-Vie 8:00-13:00
              </button>
            </div>
          )}

          {/* Day rows */}
          <div className="space-y-1">
            {[0, 1, 2, 3, 4, 5, 6].map(day => {
              const daySlots = slots
                .map((s, i) => ({ ...s, _index: i }))
                .filter(s => s.dayOfWeek === day)

              return (
                <div key={day} className="group rounded-xl hover:bg-neutral-50/50 transition-colors">
                  <div className="flex items-center gap-3 px-3 py-2">
                    {/* Day label */}
                    <span className={`w-10 text-xs font-bold uppercase tracking-wider shrink-0 ${
                      daySlots.length > 0 ? 'text-neutral-700' : 'text-neutral-300'
                    }`}>
                      {DAY_LABELS[day]}
                    </span>

                    {/* Time slots for this day */}
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      {daySlots.length === 0 ? (
                        <span className="text-[11px] text-neutral-300 italic">Sin horario</span>
                      ) : (
                        daySlots.map(slot => (
                          <div key={slot._index} className="flex items-center gap-1.5 rounded-lg bg-white border border-neutral-200 px-2 py-1.5 shadow-sm">
                            <Clock className="h-3 w-3 text-neutral-400 shrink-0" />
                            <input
                              type="time"
                              value={slot.startTime}
                              onChange={e => updateSlot(slot._index, 'startTime', e.target.value)}
                              className="w-[72px] text-xs font-bold text-neutral-700 bg-transparent outline-none"
                            />
                            <span className="text-neutral-300 text-[10px]">—</span>
                            <input
                              type="time"
                              value={slot.endTime}
                              onChange={e => updateSlot(slot._index, 'endTime', e.target.value)}
                              className="w-[72px] text-xs font-bold text-neutral-700 bg-transparent outline-none"
                            />
                            <button
                              onClick={() => removeSlot(slot._index)}
                              className="ml-1 text-neutral-300 hover:text-red-500 transition-colors"
                              title="Eliminar bloque"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Add slot for this day */}
                    <button
                      onClick={() => addSlot(day)}
                      className="opacity-0 group-hover:opacity-100 flex h-6 w-6 items-center justify-center rounded-md bg-neutral-100 text-neutral-400 hover:bg-am-doctor-50 hover:text-am-doctor-600 transition-all shrink-0"
                      title={`Agregar bloque para ${DAY_FULL_LABELS[day]}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-xs font-medium text-red-700">{errorMsg}</p>
            </div>
          )}

          {/* Save button */}
          <div className="mt-5 flex items-center justify-between">
            <p className="text-[10px] text-neutral-400">
              Duración de turno: 30 min
            </p>
            <button
              onClick={handleSave}
              disabled={saveStatus === 'saving'}
              className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold uppercase tracking-wider shadow-sm transition active:scale-[0.98] ${
                saveStatus === 'saved'
                  ? 'bg-emerald-600 text-white'
                  : saveStatus === 'error'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-am-doctor-600 text-white hover:bg-am-doctor-700'
              }`}
            >
              {saveStatus === 'saving' ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Guardando...
                </>
              ) : saveStatus === 'saved' ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Guardado
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Guardar disponibilidad
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
