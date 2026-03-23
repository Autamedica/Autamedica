'use client';

import { useState } from 'react';
import type {
  ConsultationContext,
  SuggestedQuestion,
  AnamnesisSummarySection,
} from '@/hooks/doctors/useConsultationContext';

interface ConsultationContextPanelProps {
  context: ConsultationContext | null;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  onToggle: () => void;
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  critical: { bg: 'bg-red-500/20', text: 'text-red-300', label: 'Crítico' },
  high: { bg: 'bg-amber-500/20', text: 'text-amber-300', label: 'Alto' },
  medium: { bg: 'bg-blue-500/20', text: 'text-blue-300', label: 'Medio' },
};

function PriorityBadge({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function RedFlagsList({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
      <h4 className="text-xs font-semibold text-red-300 uppercase tracking-wider mb-2">
        Alertas de seguridad
      </h4>
      <ul className="space-y-1">
        {flags.map((flag, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-red-200">
            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
            {flag}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionsChecklist({ questions }: { questions: SuggestedQuestion[] }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());

  if (questions.length === 0) return null;

  const toggle = (idx: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div>
      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
        Preguntas sugeridas
      </h4>
      <ul className="space-y-2">
        {questions.map((q, i) => (
          <li key={i} className="flex items-start gap-2">
            <button
              onClick={() => toggle(i)}
              className={`mt-0.5 h-4 w-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                checked.has(i)
                  ? 'bg-emerald-500 border-emerald-500'
                  : 'border-slate-500 hover:border-slate-400'
              }`}
            >
              {checked.has(i) && (
                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${checked.has(i) ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                {q.question}
              </p>
            </div>
            <PriorityBadge priority={q.priority} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummarySection({ section }: { section: AnamnesisSummarySection }) {
  const [open, setOpen] = useState(false);

  if (section.items.length === 0) return null;

  return (
    <div className="border-b border-slate-700/50 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-2 text-left hover:bg-slate-700/20 rounded px-2 -mx-2"
      >
        <span className="text-sm font-medium text-slate-300">{section.title}</span>
        <svg
          className={`w-4 h-4 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="pb-2 pl-2 space-y-1">
          {section.items.map((item, i) => (
            <li key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
              <span className="mt-1 h-1 w-1 rounded-full bg-slate-500 shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState({ reason }: { reason?: string }) {
  const message =
    reason === 'not_shared'
      ? 'El paciente no ha compartido su anamnesis'
      : reason === 'not_started'
        ? 'El paciente no ha completado su anamnesis'
        : 'Sin información clínica disponible';

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <svg className="w-12 h-12 text-slate-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="h-8 w-8 border-2 border-slate-600 border-t-emerald-400 rounded-full animate-spin mb-3" />
      <p className="text-sm text-slate-500">Cargando contexto clínico...</p>
    </div>
  );
}

export function ConsultationContextPanel({
  context,
  loading,
  error,
  collapsed,
  onToggle,
}: ConsultationContextPanelProps) {
  // Toggle button (always visible)
  const toggleButton = (
    <button
      onClick={onToggle}
      className="absolute top-3 -left-10 z-10 h-8 w-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center hover:bg-slate-700 transition-colors"
      title={collapsed ? 'Mostrar contexto clínico' : 'Ocultar contexto clínico'}
    >
      <svg
        className={`w-4 h-4 text-slate-400 transition-transform ${collapsed ? 'rotate-180' : ''}`}
        fill="none" viewBox="0 0 24 24" stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );

  if (collapsed) {
    return (
      <div className="relative">
        {toggleButton}
      </div>
    );
  }

  const patientName = context?.patient?.name ?? 'Paciente';
  const chiefComplaint = context?.extraction?.chiefComplaint?.normalizedMedicalText
    ?? context?.extraction?.chiefComplaint?.rawText
    ?? null;
  const clinicalNarrative = context?.extraction?.presentIllness?.clinicalNarrative ?? null;

  return (
    <div className="relative h-full flex flex-col bg-slate-900/95 border-l border-slate-700/50">
      {toggleButton}

      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-200 truncate">{patientName}</h3>
        {context?.patient?.gender && (
          <p className="text-xs text-slate-500 mt-0.5">
            {context.patient.gender === 'male' ? 'Masculino' : context.patient.gender === 'female' ? 'Femenino' : context.patient.gender}
            {context.patient.dateOfBirth && ` · ${calculateAge(context.patient.dateOfBirth)} años`}
          </p>
        )}
        {context?.anamnesisStatus && (
          <div className="mt-1 flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${
              context.anamnesisStatus === 'completed' || context.anamnesisStatus === 'approved'
                ? 'bg-emerald-400'
                : 'bg-amber-400'
            }`} />
            <span className="text-[10px] text-slate-500">
              Anamnesis {context.completionPercentage ?? 0}%
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading && <LoadingState />}

        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {!loading && !error && !context?.hasAnamnesis && (
          <EmptyState reason={context?.reason} />
        )}

        {!loading && !error && context?.hasAnamnesis && (
          <>
            {/* Chief Complaint */}
            {chiefComplaint && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Motivo de consulta
                </h4>
                <p className="text-sm text-slate-200">{chiefComplaint}</p>
              </div>
            )}

            {/* Clinical Narrative */}
            {clinicalNarrative && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Enfermedad actual
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed">{clinicalNarrative}</p>
              </div>
            )}

            {/* Red Flags */}
            <RedFlagsList flags={context.redFlags} />

            {/* Suggested Questions */}
            <QuestionsChecklist questions={context.suggestedQuestions} />

            {/* Summary Sections (collapsible) */}
            {context.summary && context.summary.sections.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Antecedentes
                </h4>
                <div className="space-y-0">
                  {context.summary.sections.map((section, i) => (
                    <SummarySection key={i} section={section} />
                  ))}
                </div>
              </div>
            )}

            {/* Quality Alerts */}
            {context.extraction?.qualityAlerts && context.extraction.qualityAlerts.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Alertas de calidad
                </h4>
                <ul className="space-y-1">
                  {context.extraction.qualityAlerts.map((alert, i) => (
                    <li key={i} className="text-xs text-amber-300/80 flex items-start gap-1.5">
                      <span className="mt-1 h-1 w-1 rounded-full bg-amber-400 shrink-0" />
                      {alert.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function calculateAge(dateOfBirth: string): number {
  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}
