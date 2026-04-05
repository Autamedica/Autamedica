'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { Check, Mic, MicOff, ChevronDown } from 'lucide-react'
import type { AnamnesisField, AnamnesisFieldValue } from '@/lib/patients/types/anamnesis'

// SpeechRecognition types in src/types/speech-recognition.d.ts

interface ConversationalFieldProps {
  field: AnamnesisField
  value: AnamnesisFieldValue
  onSubmit: (value: AnamnesisFieldValue) => void
}

/**
 * One-field-at-a-time renderer for conversational anamnesis.
 * Large touch targets, minimal text, senior-friendly.
 */
export function ConversationalField({ field, value, onSubmit }: ConversationalFieldProps) {
  switch (field.type) {
    case 'boolean':
      return <BooleanField field={field} onSubmit={onSubmit} />
    case 'select':
      return <SelectField field={field} onSubmit={onSubmit} />
    case 'multiselect':
      return <MultiselectField field={field} value={value} onSubmit={onSubmit} />
    case 'scale':
      return <ScaleField field={field} value={value} onSubmit={onSubmit} />
    case 'date':
      return <DateField field={field} onSubmit={onSubmit} />
    case 'text':
    case 'textarea':
      return <TextField field={field} value={value} onSubmit={onSubmit} />
    case 'number':
      return <NumberField field={field} value={value} onSubmit={onSubmit} />
    default:
      return <TextField field={field} value={value} onSubmit={onSubmit} />
  }
}

// --- Boolean (Sí/No) ---

function BooleanField({ field: _field, onSubmit }: { field: AnamnesisField; onSubmit: (v: AnamnesisFieldValue) => void }) {
  return (
    <div className="flex gap-4">
      <button
        onClick={() => onSubmit(true)}
        className="flex-1 rounded-2xl border-2 border-sky-200 bg-white px-6 py-5 text-lg font-bold text-sky-700 transition-all hover:border-sky-400 hover:bg-sky-50 active:scale-95"
      >
        Sí
      </button>
      <button
        onClick={() => onSubmit(false)}
        className="flex-1 rounded-2xl border-2 border-red-200 bg-white px-6 py-5 text-lg font-bold text-red-600 transition-all hover:border-red-400 hover:bg-red-50 active:scale-95"
      >
        No
      </button>
    </div>
  )
}

// --- Select (single choice) ---

function SelectField({ field, onSubmit }: { field: AnamnesisField; onSubmit: (v: AnamnesisFieldValue) => void }) {
  if (!field.options) return null
  return (
    <div className="space-y-3">
      {field.options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onSubmit(opt.value)}
          className="flex w-full items-center gap-3 rounded-2xl border-2 border-stone-200 bg-white px-5 py-4 text-left transition-all hover:border-sky-300 hover:bg-sky-50 active:scale-[0.98]"
        >
          <span className="text-base font-medium text-stone-900">{opt.label}</span>
          {opt.explanation && (
            <span className="ml-auto text-sm text-stone-400">{opt.explanation}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// --- Multiselect (tap to toggle, confirm button) ---

function MultiselectField({
  field,
  value,
  onSubmit,
}: {
  field: AnamnesisField
  value: AnamnesisFieldValue
  onSubmit: (v: AnamnesisFieldValue) => void
}) {
  const [selected, setSelected] = useState<string[]>(
    Array.isArray(value) ? (value as string[]) : [],
  )

  const toggle = useCallback((val: string) => {
    setSelected(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val],
    )
  }, [])

  if (!field.options) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {field.options.map(opt => {
          const isSelected = selected.includes(opt.value)
          return (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-all active:scale-[0.98] ${
                isSelected
                  ? 'border-sky-400 bg-sky-50'
                  : 'border-stone-200 bg-white hover:border-stone-300'
              }`}
            >
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  isSelected ? 'bg-sky-500' : 'bg-stone-100'
                }`}
              >
                {isSelected && <Check className="h-4 w-4 text-white" />}
              </div>
              <span className={`text-base ${isSelected ? 'font-semibold text-sky-900' : 'text-stone-700'}`}>
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
      <button
        onClick={() => onSubmit(selected)}
        className="w-full rounded-2xl bg-sky-600 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-sky-700 active:scale-[0.98]"
      >
        {selected.length > 0
          ? `Confirmar (${selected.length})`
          : 'Ninguna de estas'}
      </button>
    </div>
  )
}

// --- Scale (slider) ---

function ScaleField({
  field,
  value,
  onSubmit,
}: {
  field: AnamnesisField
  value: AnamnesisFieldValue
  onSubmit: (v: AnamnesisFieldValue) => void
}) {
  const min = field.validation?.min ?? 1
  const max = field.validation?.max ?? 10
  const [val, setVal] = useState<number>(typeof value === 'number' ? value : Math.round((min + max) / 2))

  return (
    <div className="space-y-6">
      <div className="text-center">
        <span className="text-5xl font-bold text-sky-700">{val}</span>
        <span className="text-lg text-stone-400"> / {max}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={val}
        onChange={e => setVal(Number(e.target.value))}
        className="h-3 w-full cursor-pointer appearance-none rounded-full bg-stone-200 accent-sky-600"
      />
      <div className="flex justify-between text-sm text-stone-400">
        <span>Leve</span>
        <span>Severo</span>
      </div>
      <button
        onClick={() => onSubmit(val)}
        className="w-full rounded-2xl bg-sky-600 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-sky-700 active:scale-[0.98]"
      >
        Confirmar
      </button>
    </div>
  )
}

// --- Date (birth date picker) ---

function DateField({
  field: _field,
  onSubmit,
}: {
  field: AnamnesisField
  onSubmit: (v: AnamnesisFieldValue) => void
}) {
  const [day, setDay] = useState('')
  const [month, setMonth] = useState('')
  const [year, setYear] = useState('')

  const [dateError, setDateError] = useState('')
  const currentYear = new Date().getFullYear()
  const isComplete = day && month && year

  const handleSubmit = useCallback(() => {
    if (!isComplete) return
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    const parsed = new Date(iso + 'T00:00:00')
    if (
      isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== Number(year) ||
      parsed.getMonth() + 1 !== Number(month) ||
      parsed.getDate() !== Number(day)
    ) {
      setDateError('Fecha inválida. Verificá el día para el mes seleccionado.')
      return
    }
    if (parsed > new Date()) {
      setDateError('La fecha no puede ser en el futuro.')
      return
    }
    setDateError('')
    onSubmit(iso)
  }, [day, month, year, isComplete, onSubmit])

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]

  const selectClass = 'rounded-xl border-2 border-stone-200 bg-white px-4 py-3.5 text-base font-medium text-stone-900 focus:border-sky-400 focus:outline-none'

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="relative">
          <select value={day} onChange={e => setDay(e.target.value)} className={`${selectClass} w-full appearance-none`}>
            <option value="">Día</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
              <option key={d} value={String(d)}>{d}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        </div>
        <div className="relative">
          <select value={month} onChange={e => setMonth(e.target.value)} className={`${selectClass} w-full appearance-none`}>
            <option value="">Mes</option>
            {months.map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        </div>
        <div className="relative">
          <select value={year} onChange={e => setYear(e.target.value)} className={`${selectClass} w-full appearance-none`}>
            <option value="">Año</option>
            {Array.from({ length: 100 }, (_, i) => currentYear - i).map(y => (
              <option key={y} value={String(y)}>{y}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
        </div>
      </div>
      {dateError && (
        <p className="text-sm font-medium text-red-600">{dateError}</p>
      )}
      <button
        onClick={handleSubmit}
        disabled={!isComplete}
        className="w-full rounded-2xl bg-sky-600 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-sky-700 disabled:bg-stone-300 disabled:text-stone-500 active:scale-[0.98]"
      >
        Confirmar
      </button>
    </div>
  )
}

// --- Text / Textarea (with voice) ---

function TextField({
  field,
  value,
  onSubmit,
}: {
  field: AnamnesisField
  value: AnamnesisFieldValue
  onSubmit: (v: AnamnesisFieldValue) => void
}) {
  const [text, setText] = useState<string>(typeof value === 'string' ? value : '')
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const toggleVoice = useCallback(() => {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = 'es-AR'
    recognition.continuous = true
    recognition.interimResults = false

    let processedResults = 0
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let newTranscript = ''
      for (let i = processedResults; i < event.results.length; i++) {
        if (event.results[i]?.[0]) {
          newTranscript += event.results[i][0].transcript + ' '
        }
      }
      processedResults = event.results.length
      const trimmed = newTranscript.trim()
      if (trimmed) {
        setText(prev => prev ? `${prev} ${trimmed}` : trimmed)
      }
    }

    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }, [listening])

  const hasSpeech = typeof window !== 'undefined' && (window.SpeechRecognition ?? window.webkitSpeechRecognition)

  return (
    <div className="space-y-4">
      <div className="relative">
        <textarea
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={field.placeholder ?? 'Escribí tu respuesta...'}
          rows={field.type === 'textarea' ? 4 : 2}
          className="w-full resize-none rounded-2xl border-2 border-stone-200 bg-white px-5 py-4 text-base text-stone-900 placeholder:text-stone-400 focus:border-sky-400 focus:outline-none"
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey && text.trim()) {
              e.preventDefault()
              onSubmit(text.trim())
            }
          }}
        />
        {hasSpeech && (
          <button
            type="button"
            onClick={toggleVoice}
            className={`absolute bottom-3 right-3 rounded-full p-2.5 transition-colors ${
              listening
                ? 'bg-red-100 text-red-600 animate-pulse'
                : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
            }`}
            aria-label={listening ? 'Detener dictado' : 'Dictar respuesta'}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
      </div>
      <button
        onClick={() => text.trim() && onSubmit(text.trim())}
        disabled={!text.trim() && field.required}
        className="w-full rounded-2xl bg-sky-600 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-sky-700 disabled:bg-stone-300 disabled:text-stone-500 active:scale-[0.98]"
      >
        {text.trim() ? 'Continuar' : field.required ? 'Escribí tu respuesta' : 'Omitir'}
      </button>
    </div>
  )
}

// --- Number ---

function NumberField({
  field,
  value,
  onSubmit,
}: {
  field: AnamnesisField
  value: AnamnesisFieldValue
  onSubmit: (v: AnamnesisFieldValue) => void
}) {
  const [num, setNum] = useState<string>(typeof value === 'number' ? String(value) : '')

  return (
    <div className="space-y-4">
      <input
        type="number"
        value={num}
        onChange={e => setNum(e.target.value)}
        placeholder={field.placeholder ?? 'Ingresá un número'}
        min={field.validation?.min}
        max={field.validation?.max}
        autoFocus
        className="w-full rounded-2xl border-2 border-stone-200 bg-white px-5 py-4 text-center text-2xl font-bold text-stone-900 placeholder:text-stone-400 focus:border-sky-400 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        onKeyDown={e => {
          if (e.key === 'Enter' && num) {
            e.preventDefault()
            onSubmit(Number(num))
          }
        }}
      />
      <button
        onClick={() => num && onSubmit(Number(num))}
        disabled={!num && field.required}
        className="w-full rounded-2xl bg-sky-600 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-sky-700 disabled:bg-stone-300 disabled:text-stone-500 active:scale-[0.98]"
      >
        Continuar
      </button>
    </div>
  )
}
