'use client';

import { Check, CheckCircle, HelpCircle, Mic, MicOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnamnesisFieldValue, AnamnesisField as FieldType } from '@/lib/patients/types/anamnesis';

// --- Voice Input Hook ---
function useVoiceInput(onResult: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(!!SR);
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = 'es-AR';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    return () => { recognition.abort(); };
  }, [onResult]);

  const toggle = useCallback(() => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  }, [listening]);

  return { listening, supported, toggle };
}

function VoiceMicButton({ onResult, currentValue }: { onResult: (text: string) => void; currentValue: string }) {
  const handleResult = useCallback((transcript: string) => {
    // Append to current value if exists, otherwise replace
    const newValue = currentValue ? `${currentValue} ${transcript}` : transcript;
    onResult(newValue);
  }, [onResult, currentValue]);

  const { listening, supported, toggle } = useVoiceInput(handleResult);

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className={`absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 transition-all ${
        listening
          ? 'bg-red-100 text-red-600 animate-pulse'
          : 'text-stone-300 hover:bg-stone-100 hover:text-stone-500'
      }`}
      title={listening ? 'Detener grabación' : 'Hablar para completar'}
    >
      {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}

/** Convert AnamnesisFieldValue to a value safe for HTML input/select/textarea elements */
function toInputValue(v: AnamnesisFieldValue): string | number | undefined {
  if (v === null || v === undefined || typeof v === 'boolean') return '';
  if (Array.isArray(v)) return '';
  return v;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function BirthDatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Local state for partial selections — only call onChange when all 3 are filled
  const [parts, setParts] = useState(() => {
    if (!value) return { day: '', month: '', year: '' };
    const [y, m, d] = value.split('-');
    return { day: String(parseInt(d || '0') || ''), month: String(parseInt(m || '0') || ''), year: y || '' };
  });

  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = currentYear; y >= currentYear - 120; y--) arr.push(y);
    return arr;
  }, [currentYear]);

  const daysInMonth = useMemo(() => {
    const m = parseInt(parts.month);
    const y = parseInt(parts.year);
    if (!m) return 31;
    return new Date(y || currentYear, m, 0).getDate();
  }, [parts.month, parts.year, currentYear]);

  const handleChange = useCallback((part: 'day' | 'month' | 'year', val: string) => {
    setParts(prev => {
      const next = { ...prev, [part]: val };
      // Emit full date when all 3 parts are selected
      if (next.day && next.month && next.year) {
        const d = next.day.padStart(2, '0');
        const m = next.month.padStart(2, '0');
        onChange(`${next.year}-${m}-${d}`);
      }
      return next;
    });
  }, [onChange]);

  const selectClass = 'flex-1 rounded-xl border border-stone-200 bg-white px-3 py-3 text-[15px] text-stone-900 shadow-sm outline-none transition-all focus:border-stone-400 focus:ring-2 focus:ring-stone-900/5 cursor-pointer';

  return (
    <div className="flex gap-2">
      <select
        value={parts.day}
        onChange={(e) => handleChange('day', e.target.value)}
        className={selectClass}
        aria-label="Día"
      >
        <option value="">Día</option>
        {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
          <option key={d} value={String(d)}>{d}</option>
        ))}
      </select>
      <select
        value={parts.month}
        onChange={(e) => handleChange('month', e.target.value)}
        className={selectClass}
        aria-label="Mes"
      >
        <option value="">Mes</option>
        {MONTHS.map((name, i) => (
          <option key={i} value={String(i + 1)}>{name}</option>
        ))}
      </select>
      <select
        value={parts.year}
        onChange={(e) => handleChange('year', e.target.value)}
        className={selectClass}
        aria-label="Año"
      >
        <option value="">Año</option>
        {years.map((y) => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </select>
    </div>
  );
}

interface AnamnesisFieldProps {
  field: FieldType;
  value: AnamnesisFieldValue;
  onChange: (value: AnamnesisFieldValue) => void;
  onComplete?: () => void;
}

export function AnamnesisField({ field, value, onChange, onComplete }: AnamnesisFieldProps) {
  const [showEducationalNote, setShowEducationalNote] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const updateFieldValue = (newValue: AnamnesisFieldValue) => {
    onChange(newValue);
    if (field.educationalNote && newValue) {
      setShowEducationalNote(true);
      onComplete?.();
    }
  };

  const inputBase = 'w-full rounded-xl border border-stone-200 bg-white px-4 py-3 text-[15px] text-stone-900 shadow-sm outline-none transition-all placeholder:text-stone-300 focus:border-stone-400 focus:ring-2 focus:ring-stone-900/5';

  const renderField = () => {
    switch (field.type) {
      case 'text':
        return (
          <div className="relative">
            <input
              type="text"
              value={toInputValue(value) || ''}
              onChange={(e) => updateFieldValue(e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              className={`${inputBase} pr-11`}
            />
            <VoiceMicButton
              currentValue={String(toInputValue(value) || '')}
              onResult={(text) => updateFieldValue(text)}
            />
          </div>
        );

      case 'number':
        return (
          <input
            type="number"
            value={toInputValue(value) || ''}
            onChange={(e) => updateFieldValue(Number(e.target.value))}
            placeholder={field.placeholder}
            required={field.required}
            min={field.validation?.min}
            max={field.validation?.max}
            className={inputBase}
          />
        );

      case 'textarea':
        return (
          <div className="relative">
          <textarea
            value={toInputValue(value) || ''}
            onChange={(e) => updateFieldValue(e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
            rows={4}
            className={`${inputBase} resize-none pr-11`}
          />
          <button
            type="button"
            className="absolute right-3 top-3 rounded-full p-1.5 text-stone-300 transition-all hover:bg-stone-100 hover:text-stone-500"
            title="Hablar para completar"
            onClick={() => {
              const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition;
              if (!SR) return;
              const r = new SR();
              r.lang = 'es-AR';
              r.onresult = (e: SpeechRecognitionEvent) => {
                const t = e.results[0][0].transcript;
                const cur = String(toInputValue(value) || '');
                updateFieldValue(cur ? `${cur} ${t}` : t);
              };
              r.start();
            }}
          >
            <Mic className="h-4 w-4" />
          </button>
          </div>
        );

      case 'select':
        return (
          <select
            value={toInputValue(value) || ''}
            onChange={(e) => updateFieldValue(e.target.value)}
            required={field.required}
            className={`${inputBase} cursor-pointer`}
          >
            <option value="">Selecciona una opcion</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div className="grid gap-2.5 md:grid-cols-2">
            {field.options?.map((option) => {
              const currentArr = Array.isArray(value) ? value as string[] : [];
              const isSelected = currentArr.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`group flex cursor-pointer items-start gap-3.5 rounded-xl border bg-white px-4 py-3.5 shadow-sm transition-all active:scale-[0.98] ${
                    isSelected
                      ? 'border-stone-900 ring-1 ring-stone-900'
                      : 'border-stone-200 hover:border-stone-300 hover:shadow-md'
                  }`}
                >
                  <div className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
                    isSelected
                      ? 'border-stone-900 bg-stone-900 text-white'
                      : 'border-stone-300 group-hover:border-stone-400'
                  }`}>
                    {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-stone-800">{option.label}</p>
                    {option.explanation && (
                      <p className="mt-0.5 text-[13px] leading-snug text-stone-400">{option.explanation}</p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        );

      case 'boolean':
        return (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => updateFieldValue(true)}
              className={`flex-1 rounded-xl border px-4 py-3.5 text-sm font-bold transition-all active:scale-[0.97] ${
                value === true
                  ? 'border-sky-500 bg-sky-500 text-white shadow-sm'
                  : 'border-stone-200 bg-white text-stone-600 shadow-sm hover:border-stone-300 hover:shadow-md'
              }`}
            >
              Si
            </button>
            <button
              type="button"
              onClick={() => updateFieldValue(false)}
              className={`flex-1 rounded-xl border px-4 py-3.5 text-sm font-bold transition-all active:scale-[0.97] ${
                value === false
                  ? 'border-stone-900 bg-stone-900 text-white shadow-sm'
                  : 'border-stone-200 bg-white text-stone-600 shadow-sm hover:border-stone-300 hover:shadow-md'
              }`}
            >
              No
            </button>
          </div>
        );

      case 'scale':
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-center">
              <span className="text-3xl font-bold tabular-nums text-stone-900">{toInputValue(value) || field.validation?.min || 1}</span>
            </div>
            <input
              type="range"
              min={field.validation?.min || 1}
              max={field.validation?.max || 10}
              value={toInputValue(value) || field.validation?.min || 1}
              onChange={(e) => updateFieldValue(Number(e.target.value))}
              className="w-full h-2 cursor-pointer appearance-none rounded-full bg-stone-200 accent-stone-900"
            />
            <div className="flex justify-between text-xs font-medium text-stone-400">
              <span>Leve</span>
              <span>Insoportable</span>
            </div>
          </div>
        );

      case 'date':
        return <BirthDatePicker value={typeof value === 'string' ? value : ''} onChange={updateFieldValue} />;

      default:
        return null;
    }
  };

  return (
    <div className="space-y-2.5">
      {/* Label con tooltip */}
      <div className="flex items-start justify-between gap-2">
        <label className="text-[13px] font-semibold text-stone-600 flex-1">
          {field.label}
          {field.required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
        {field.tooltip && (
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="text-stone-300 hover:text-stone-500 transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            {showTooltip && (
              <div className="absolute right-0 top-7 z-10 w-72 rounded-xl bg-stone-900 p-4 text-[13px] leading-relaxed text-white shadow-xl">
                <p className="whitespace-pre-line">{field.tooltip}</p>
                <div className="absolute -top-1 right-3 h-2 w-2 rotate-45 bg-stone-900"></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campo */}
      {renderField()}

      {/* Nota educativa al completar */}
      {showEducationalNote && field.educationalNote && (
        <div className="overflow-hidden rounded-xl bg-sky-50 ring-1 ring-sky-100">
          <div className="flex items-start gap-3 px-4 py-3.5">
            <CheckCircle className="h-5 w-5 text-sky-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-sky-900">Excelente</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-sky-700">{field.educationalNote}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
