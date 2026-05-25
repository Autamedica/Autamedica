'use client';

import { useState } from 'react';
import { 
  Loader2, Mic, Square, Volume2, ChevronDown, 
  AlertCircle, AlertTriangle, HelpCircle, User, 
  Clipboard, Activity, History, Users, Search,
  CheckCircle2, Info, type LucideIcon
} from 'lucide-react';
import type {
  ConsultationContext,
  SuggestedQuestion,
} from '@/hooks/doctors/useConsultationContext';

type NotesSaveState = 'idle' | 'saving' | 'saved' | 'error';

interface ConsultationContextPanelProps {
  context: ConsultationContext | null;
  loading: boolean;
  error: string | null;
  collapsed: boolean;
  onToggle: () => void;
  liveNotes: string;
  onLiveNotesChange: (value: string) => void;
  notesSaveState: NotesSaveState;
  micLevel: number;
  voiceNotesEnabled: boolean;
  voiceNotesAvailable: boolean;
  liveTranscriptPreview: string | null;
  onToggleVoiceNotes: () => void;
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string; label: string; icon: LucideIcon }> = {
  critical: { bg: 'bg-red-50', text: 'text-red-700', label: 'Crítico', icon: AlertCircle },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Alto', icon: AlertTriangle },
  medium: { bg: 'bg-am-doctor-50', text: 'text-am-doctor-700', label: 'Medio', icon: Info },
};

function PriorityBadge({ priority }: { priority: string }) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES.medium;
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${style.bg} ${style.text}`}>
      <Icon className="h-2.5 w-2.5" />
      {style.label}
    </span>
  );
}

function SectionContainer({ 
  title, 
  icon: Icon, 
  children, 
  defaultOpen = false,
  badge
}: { 
  title: string; 
  icon: LucideIcon; 
  children: React.ReactNode; 
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-am-surface-100 last:border-b-0 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-3.5 px-4 text-left hover:bg-am-surface-50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg transition-colors ${isOpen ? 'bg-am-doctor-100 text-am-doctor-700' : 'bg-am-surface-100 text-am-surface-500 group-hover:bg-am-surface-200'}`}>
            <Icon className="h-4 w-4" />
          </div>
          <span className={`text-sm font-semibold tracking-tight ${isOpen ? 'text-am-surface-900' : 'text-am-surface-600'}`}>
            {title}
          </span>
          {badge}
        </div>
        <ChevronDown className={`w-4 h-4 text-am-surface-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

function RedFlagsPanel({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;

  return (
    <div className="mx-4 my-2 rounded-2xl border border-red-100 bg-red-50/50 p-4 shadow-sm border-l-4 border-l-red-500">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-4 w-4 text-red-600" />
        <h4 className="text-xs font-bold text-red-700 uppercase tracking-widest">
          Alertas de seguridad
        </h4>
      </div>
      <ul className="space-y-1.5">
        {flags.map((flag, i) => (
          <li key={i} className="flex items-start gap-2.5 text-sm text-red-800 leading-relaxed font-medium">
            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
            {flag}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuestionsList({ questions }: { questions: SuggestedQuestion[] }) {
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
    <div className="space-y-2.5">
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => toggle(i)}
          className={`w-full flex items-start gap-3 p-3 rounded-xl border transition-all text-left ${
            checked.has(i)
              ? 'bg-am-surface-50 border-am-surface-100 opacity-60'
              : 'bg-white border-am-surface-100 hover:border-am-doctor-200 hover:shadow-am-sm'
          }`}
        >
          <div className={`mt-0.5 h-5 w-5 rounded-full border shrink-0 flex items-center justify-center transition-colors ${
            checked.has(i)
              ? 'bg-am-doctor-500 border-am-doctor-500 text-white'
              : 'border-am-surface-300'
          }`}>
            {checked.has(i) && <CheckCircle2 className="w-3.5 h-3.5" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-sm font-medium leading-relaxed ${checked.has(i) ? 'text-am-surface-400 line-through' : 'text-am-surface-800'}`}>
              {q.question}
            </p>
            <div className="mt-1.5">
              <PriorityBadge priority={q.priority} />
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function MicLevelMeter({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-am-surface-200 bg-white px-3 py-2 shadow-inner">
      <Volume2 className="h-3.5 w-3.5 text-am-surface-400 shrink-0" />
      <div className="flex h-5 flex-1 items-end gap-[3px]">
        {Array.from({ length: 18 }).map((_, index) => (
          <div
            key={index}
            className={`flex-1 rounded-full transition-all duration-75 ${
              level * 18 > index
                ? index < 11 ? 'bg-am-doctor-400' : index < 15 ? 'bg-amber-400' : 'bg-red-400'
                : 'bg-am-surface-100'
            }`}
            style={{ height: `${Math.max(25, (index / 18) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function LiveNotesSection({
  liveNotes,
  onLiveNotesChange,
  notesSaveState,
  micLevel,
  voiceNotesEnabled,
  voiceNotesAvailable,
  liveTranscriptPreview,
  onToggleVoiceNotes,
}: {
  liveNotes: string;
  onLiveNotesChange: (value: string) => void;
  notesSaveState: NotesSaveState;
  micLevel: number;
  voiceNotesEnabled: boolean;
  voiceNotesAvailable: boolean;
  liveTranscriptPreview: string | null;
  onToggleVoiceNotes: () => void;
}) {
  const hasContent = liveNotes.trim().length > 0;
  
  return (
    <div className="border-b border-am-surface-200 bg-am-surface-50/50">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-am-surface-400">
            Notas en vivo
          </p>
          <p className="mt-0.5 text-sm font-bold text-am-surface-900">
            Texto + voz durante la llamada
          </p>
        </div>
        
        <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
          !hasContent ? 'bg-white border-am-surface-200 text-am-surface-400' :
          notesSaveState === 'saving' ? 'bg-amber-50 border-amber-200 text-amber-700' :
          notesSaveState === 'error' ? 'bg-red-50 border-red-200 text-red-700' :
          'bg-am-doctor-50 border-am-doctor-200 text-am-doctor-700'
        }`}>
          {notesSaveState === 'saving' ? 'GUARDANDO...' : 
           notesSaveState === 'error' ? 'ERROR LOCAL' :
           hasContent ? 'BORRADOR GUARDADO' : 'SIN NOTAS'}
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3">
        <MicLevelMeter level={micLevel} />

        <div className="relative group">
          <textarea
            value={liveNotes}
            onChange={(event) => onLiveNotesChange(event.target.value)}
            placeholder="Escribe o dicta observaciones breves..."
            className="h-36 w-full resize-none rounded-2xl border border-am-surface-200 bg-white px-4 py-3.5 text-sm leading-relaxed text-am-surface-800 placeholder:text-am-surface-400 focus:outline-none focus:ring-2 focus:ring-am-doctor-500/20 focus:border-am-doctor-500 transition-all shadow-am-sm"
          />
          <div className="absolute bottom-3 right-3 text-[10px] font-mono text-am-surface-300 group-focus-within:text-am-doctor-400 transition-colors">
            {liveNotes.length}/10000
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onToggleVoiceNotes}
            disabled={!voiceNotesAvailable}
            className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3 text-xs font-bold transition-all shadow-am-sm active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${
              voiceNotesEnabled
                ? 'bg-red-600 text-white hover:bg-red-700 ring-4 ring-red-100'
                : 'bg-am-doctor-600 text-white hover:bg-am-doctor-700'
            }`}
          >
            {voiceNotesEnabled ? (
              <>
                <Square className="h-3.5 w-3.5 fill-current" />
                <span>DETENER DICTADO</span>
              </>
            ) : (
              <>
                <Mic className="h-3.5 w-3.5" />
                <span>ACTIVAR DICTADO</span>
              </>
            )}
          </button>

        </div>

        {liveTranscriptPreview && (
          <div className="rounded-2xl border border-am-doctor-100 bg-white/80 p-3 shadow-am-sm border-l-4 border-l-am-doctor-400 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="h-1.5 w-1.5 rounded-full bg-am-doctor-500 animate-pulse" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-am-doctor-600">
                Dictado en curso
              </p>
            </div>
            <p className="text-sm leading-relaxed text-am-surface-700 italic">
              "...{liveTranscriptPreview}"
            </p>
          </div>
        )}

        <p className="text-[10px] leading-4 text-am-surface-400 text-center font-medium">
          Autoguardado cada 900ms · Reaparece en el reporte final
        </p>
      </div>
    </div>
  );
}

export function ConsultationContextPanel({
  context,
  loading,
  error,
  collapsed,
  onToggle,
  liveNotes,
  onLiveNotesChange,
  notesSaveState,
  micLevel,
  voiceNotesEnabled,
  voiceNotesAvailable,
  liveTranscriptPreview,
  onToggleVoiceNotes,
}: ConsultationContextPanelProps) {
  // Toggle button
  const toggleButton = (
    <button
      onClick={onToggle}
      className="absolute top-4 -left-5 z-20 h-10 w-10 rounded-xl bg-white border border-am-surface-200 shadow-am-md flex items-center justify-center hover:bg-am-surface-50 transition-all hover:scale-105 active:scale-95"
      title={collapsed ? 'Ver Paciente' : 'Ocultar'}
    >
      <ChevronDown className={`w-5 h-5 text-am-surface-600 transition-transform duration-500 ${collapsed ? '-rotate-90' : 'rotate-90'}`} />
    </button>
  );

  if (collapsed) {
    return <div className="relative h-full w-0">{toggleButton}</div>;
  }

  const patientName = context?.patient?.name ?? 'Paciente';
  const age = context?.patient?.dateOfBirth ? calculateAge(context.patient.dateOfBirth) : null;
  const gender = context?.patient?.gender === 'male' ? 'Masculino' : context?.patient?.gender === 'female' ? 'Femenino' : null;

  return (
    <div className="relative h-full flex flex-col bg-white border-l border-am-surface-200 shadow-am-lg animate-in slide-in-from-right duration-500">
      {toggleButton}

      {/* Profile Header */}
      <div className="px-5 py-5 bg-gradient-to-br from-am-surface-50 to-white border-b border-am-surface-100">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-am-doctor-100 border border-am-doctor-200 flex items-center justify-center text-am-doctor-700 shadow-am-sm">
            <User className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-am-surface-900 truncate tracking-tight">{patientName}</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs font-semibold text-am-surface-500">{gender || 'Género no especificado'}</span>
              {age && (
                <>
                  <span className="h-1 w-1 rounded-full bg-am-surface-300" />
                  <span className="text-xs font-semibold text-am-surface-500">{age} años</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        {context?.completionPercentage !== undefined && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-am-surface-500">
              <span className="flex items-center gap-1">
                <span className={`h-2 w-2 rounded-full ${context.completionPercentage >= 80 ? 'bg-am-doctor-500' : 'bg-amber-500'}`} />
                Anamnesis
              </span>
              <span>{context.completionPercentage}%</span>
            </div>
            <div className="h-1.5 w-full bg-am-surface-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-1000 ease-out ${context.completionPercentage >= 80 ? 'bg-am-doctor-500' : 'bg-amber-500'}`}
                style={{ width: `${context.completionPercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-am-surface-200">
        <LiveNotesSection
          liveNotes={liveNotes}
          onLiveNotesChange={onLiveNotesChange}
          notesSaveState={notesSaveState}
          micLevel={micLevel}
          voiceNotesEnabled={voiceNotesEnabled}
          voiceNotesAvailable={voiceNotesAvailable}
          liveTranscriptPreview={liveTranscriptPreview}
          onToggleVoiceNotes={onToggleVoiceNotes}
        />

        <div className="py-2">
          {loading && (
            <div className="py-12 flex flex-col items-center justify-center opacity-50">
              <Loader2 className="h-8 w-8 text-am-doctor-500 animate-spin mb-4" />
              <p className="text-xs font-bold text-am-surface-400 uppercase tracking-widest">Sincronizando ficha...</p>
            </div>
          )}

          {error && (
            <div className="m-4 p-4 rounded-2xl bg-red-50 border border-red-100 flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm font-medium text-red-700">{error}</p>
            </div>
          )}

          {!loading && !error && !context?.hasAnamnesis && (
            <div className="py-16 px-6 text-center">
              <div className="mx-auto h-16 w-16 rounded-3xl bg-am-surface-50 flex items-center justify-center text-am-surface-200 mb-4 border border-am-surface-100">
                <Clipboard className="h-8 w-8" />
              </div>
              <h4 className="text-sm font-bold text-am-surface-800 uppercase tracking-tight">Sin anamnesis activa</h4>
              <p className="mt-2 text-xs text-am-surface-500 leading-relaxed max-w-[200px] mx-auto">
                {context?.reason === 'not_shared' 
                  ? 'El paciente optó por no compartir su historial clínico digital.' 
                  : 'El paciente aún no ha completado el formulario pre-consulta.'}
              </p>
            </div>
          )}

          {!loading && !error && context?.hasAnamnesis && (
            <div className="divide-y divide-am-surface-50">
              {/* Safety/Critical Info */}
              <RedFlagsPanel flags={context.redFlags} />

              {/* Chief Complaint */}
              {context.extraction?.chiefComplaint && (
                <div className="px-5 py-4 bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Search className="h-3.5 w-3.5 text-am-doctor-500" />
                    <h4 className="text-[10px] font-bold text-am-doctor-600 uppercase tracking-[0.15em]">Motivo de consulta</h4>
                  </div>
                  <p className="text-sm font-bold text-am-surface-900 leading-relaxed border-l-2 border-am-doctor-200 pl-3">
                    {context.extraction.chiefComplaint.normalizedMedicalText || context.extraction.chiefComplaint.rawText}
                  </p>
                </div>
              )}

              {/* Clinical Sections */}
              <SectionContainer title="Relato de enfermedad actual" icon={Activity} defaultOpen={true}>
                <p className="text-sm text-am-surface-700 leading-relaxed font-medium">
                  {context.extraction?.presentIllness?.clinicalNarrative || 'No se extrajo relato estructurado.'}
                </p>
              </SectionContainer>

              <SectionContainer title="Repreguntas prioritarias" icon={HelpCircle} defaultOpen={true} badge={
                context.suggestedQuestions.length > 0 && (
                  <span className="ml-1 px-1.5 rounded-full bg-am-doctor-600 text-white text-[9px] font-bold">{context.suggestedQuestions.length}</span>
                )
              }>
                <QuestionsList questions={context.suggestedQuestions} />
              </SectionContainer>

              {/* Physiological History */}
              {context.extraction?.personalHistory?.physiological && (
                <SectionContainer title="Antecedentes fisiológicos" icon={User}>
                  <ul className="grid gap-1.5">
                    {context.extraction.personalHistory.physiological.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-semibold text-am-surface-600 bg-am-surface-50 px-3 py-2 rounded-xl">
                        <span className="h-1 w-1 rounded-full bg-am-surface-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionContainer>
              )}

              {/* Pathological History */}
              {context.extraction?.personalHistory?.pathological && (
                <SectionContainer title="Antecedentes patológicos" icon={AlertCircle}>
                   <ul className="grid gap-1.5">
                    {context.extraction.personalHistory.pathological.map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs font-semibold text-am-surface-800 bg-red-50/30 px-3 py-2 rounded-xl border border-red-100/50">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionContainer>
              )}

              {/* Family History */}
              {context.extraction?.familyHistory && context.extraction.familyHistory.length > 0 && (
                <SectionContainer title="Antecedentes familiares" icon={Users}>
                  <ul className="grid gap-1.5">
                    {context.extraction.familyHistory.map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs font-semibold text-am-surface-600 bg-am-surface-50 px-3 py-2 rounded-xl">
                        <span className="mt-1 h-1 w-1 rounded-full bg-am-surface-400" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </SectionContainer>
              )}

              {/* Quality Alerts at the bottom */}
              {context.extraction?.qualityAlerts && context.extraction.qualityAlerts.length > 0 && (
                <div className="px-5 py-6 bg-amber-50/30">
                  <div className="flex items-center gap-2 mb-3">
                    <History className="h-4 w-4 text-amber-600" />
                    <h4 className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Alertas de calidad del relato</h4>
                  </div>
                  <ul className="space-y-3">
                    {context.extraction.qualityAlerts.map((alert, i) => (
                      <li key={i} className="flex items-start gap-3 p-3 rounded-xl bg-white border border-amber-100 shadow-am-sm">
                        <div className="mt-0.5 rounded-full bg-amber-100 p-1">
                          <AlertTriangle className="h-3 w-3 text-amber-600" />
                        </div>
                        <p className="text-xs font-semibold text-amber-800 leading-normal">
                          {alert.message}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="px-4 py-3 bg-am-surface-50 border-t border-am-surface-100 text-center">
        <p className="text-[9px] font-bold text-am-surface-400 uppercase tracking-tighter">
          AutaMedica AI · Procesamiento clínico en tiempo real
        </p>
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
