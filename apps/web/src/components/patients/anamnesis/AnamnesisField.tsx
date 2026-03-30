'use client';

import { CheckCircle, HelpCircle, Mic, MicOff } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AnamnesisFieldValue, AnamnesisField as FieldType } from '@/lib/patients/types/anamnesis';

// Web Speech API types — not in default TS lib
interface SpeechRecognitionEvent extends Event {
  readonly results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  readonly length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}
declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

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
      className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-all ${
        listening
          ? 'bg-red-100 text-red-600 animate-pulse'
          : 'bg-stone-100 text-stone-500 hover:bg-emerald-100 hover:text-emerald-700'
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

  const selectClass = 'flex-1 px-3 py-2.5 text-sm border-2 border-stone-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-all text-stone-900 bg-white cursor-pointer';

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
              className="w-full px-3 pr-10 py-2 text-sm border-2 border-stone-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-all text-stone-900"
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
            className="w-full px-3 py-2 text-sm border-2 border-stone-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-all text-stone-900"
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
            className="w-full px-3 pb-2 pt-2 pr-10 text-sm border-2 border-stone-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-all text-stone-900 resize-none"
          />
          <button
            type="button"
            className="absolute right-2 top-2 p-1.5 rounded-full bg-stone-100 text-stone-500 hover:bg-emerald-100 hover:text-emerald-700 transition-all"
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
            className="w-full px-3 py-2 text-sm border-2 border-stone-300 rounded-lg focus:border-sky-500 focus:ring-2 focus:ring-sky-200 outline-none transition-all text-stone-900"
          >
            <option value="">Selecciona una opción</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case 'multiselect':
        return (
          <div className="grid md:grid-cols-2 gap-3">
            {field.options?.map((option) => {
              const currentArr = Array.isArray(value) ? value as string[] : [];
              const isSelected = currentArr.includes(option.value);
              return (
                <label
                  key={option.value}
                  className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-all hover:shadow-sm ${
                    isSelected
                      ? 'border-sky-300 bg-sky-100'
                      : 'border-stone-200 hover:border-stone-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      const newValue = e.target.checked
                        ? [...currentArr, option.value]
                        : currentArr.filter((v) => v !== option.value);
                      updateFieldValue(newValue);
                    }}
                    className="mt-0.5 h-4 w-4 text-sky-700 border-stone-300 rounded focus:ring-sky-500"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-900">{option.label}</p>
                    {option.explanation && (
                      <p className="text-sm text-stone-500 mt-1">{option.explanation}</p>
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
            <label className={`flex-1 p-3 border-2 rounded-lg cursor-pointer transition-all text-center ${
              value === true ? 'border-green-500 bg-green-50' : 'border-stone-200 hover:border-stone-300'
            }`}>
              <input
                type="radio"
                checked={value === true}
                onChange={() => updateFieldValue(true)}
                className="sr-only"
              />
              <span className="text-sm font-semibold text-stone-900">✓ Sí</span>
            </label>
            <label className={`flex-1 p-3 border-2 rounded-lg cursor-pointer transition-all text-center ${
              value === false ? 'border-red-500 bg-red-50' : 'border-stone-200 hover:border-stone-300'
            }`}>
              <input
                type="radio"
                checked={value === false}
                onChange={() => updateFieldValue(false)}
                className="sr-only"
              />
              <span className="text-sm font-semibold text-stone-900">✗ No</span>
            </label>
          </div>
        );

      case 'scale':
        return (
          <div className="space-y-2">
            <input
              type="range"
              min={field.validation?.min || 1}
              max={field.validation?.max || 10}
              value={toInputValue(value) || field.validation?.min || 1}
              onChange={(e) => updateFieldValue(Number(e.target.value))}
              className="w-full h-2 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-sky-600"
            />
            <div className="flex justify-between text-sm text-stone-600">
              <span>1 (Leve)</span>
              <span className="text-lg font-bold text-stone-900">{toInputValue(value) || field.validation?.min || 1}</span>
              <span>10 (Insoportable)</span>
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
    <div className="space-y-3">
      {/* Label con tooltip */}
      <div className="flex items-start justify-between gap-2">
        <label className="text-sm font-medium text-stone-700 flex-1">
          {field.label}
          {field.required && <span className="text-red-600 ml-1">*</span>}
        </label>
        {field.tooltip && (
          <div className="relative">
            <button
              type="button"
              onMouseEnter={() => setShowTooltip(true)}
              onMouseLeave={() => setShowTooltip(false)}
              className="text-stone-500 hover:text-stone-700 transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            {showTooltip && (
              <div className="absolute right-0 top-6 z-10 w-64 p-3 bg-stone-900 text-white text-sm rounded-lg shadow-xl">
                <p className="whitespace-pre-line">{field.tooltip}</p>
                <div className="absolute -top-1 right-2 w-0 h-0 border-l-4 border-r-4 border-b-4 border-transparent border-b-stone-900"></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Campo */}
      {renderField()}

      {/* Nota educativa al completar */}
      {showEducationalNote && field.educationalNote && (
        <div className="bg-green-50 border-l-4 border-green-500 p-3 rounded-r-lg animate-fade-in">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-green-900 font-medium mb-1">¡Excelente!</p>
              <p className="text-sm text-green-800">{field.educationalNote}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
