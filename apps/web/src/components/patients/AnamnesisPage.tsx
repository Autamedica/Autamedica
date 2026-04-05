'use client';

import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  Download,
  Loader2,
  Lock,
  Mic,
  MessageCircle,
  PlayCircle,
  Plus,
} from 'lucide-react';
import { useAnamnesisFlow } from '@/hooks/patients/useAnamnesisFlow';
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps';
import { AnamnesisField as AnamnesisFieldRenderer } from '@/components/patients/anamnesis/AnamnesisField';
import { VersionTimeline } from '@/components/patients/anamnesis/VersionTimeline';
import { PrivacyAcceptanceScreen } from '@/components/patients/anamnesis/PrivacyAcceptanceScreen';
import { AnamnesisChatModal } from '@/components/patients/anamnesis/AnamnesisChatModal';
import { AnalysisResultOverlay } from '@/components/patients/anamnesis/AnalysisResultOverlay';
import { AnamnesisFlowTour } from '@/components/patients/tours/AnamnesisFlowTour';
import { ConversationalAnamnesis } from '@/components/patients/anamnesis/ConversationalAnamnesis';
import { VoiceAnamnesis } from '@/components/patients/anamnesis/VoiceAnamnesis';

const SECTION_SHORT_LABELS: Record<string, string> = {
  edad: 'Edad',
  ocupacion: 'Trabajo',
  motivo_consulta: 'Motivo',
  enfermedades_previas: 'Enfermedades',
  medicamentos: 'Medicamentos',
  alergias: 'Alergias',
  antecedentes_familiares: 'Familia',
  habitos: 'Hábitos',
  cardiovascular: 'Corazón',
  respiratorio: 'Pulmones',
  digestivo: 'Digestivo',
  genitourinario: 'Urinario',
  resumen_final: 'Resumen',
};

const UPDATE_PICKER_OPTIONS = [
  { id: 'motivo_consulta', label: 'Nuevo motivo de consulta', icon: '🎯' },
  { id: 'medicamentos', label: 'Medicamentos', icon: '💊' },
  { id: 'alergias', label: 'Alergias', icon: '⚠️' },
  { id: 'enfermedades_previas', label: 'Enfermedades', icon: '📋' },
  { id: 'habitos', label: 'Habitos', icon: '🏃' },
  { id: 'cardiovascular', label: 'Sintomas cardiovasculares', icon: '❤️' },
] as const;

export default function AnamnesisPage() {
  const {
    user,
    guidance,
    currentStepIndex,
    currentStep,
    formData,
    visibleFields,
    pageView,
    completionPct,
    isFirstStep,
    isLastStep,
    isExtracting,
    isStepCarriedForward,
    editingCarriedStep,
    saving,
    saveError,
    showClarification,
    pendingCheckpoint,
    anamnesisMode,
    showAnalyzing,
    analysisResult,
    showUpdatePicker,
    showVoiceChat,
    editMode,
    anamnesisError,
    anamnesis,
    progress,
    updateSection,
    updateAnamnesis,
    setEditingCarriedStep,
    setShowClarification,
    setShowUpdatePicker,
    setShowVoiceChat,
    switchMode,
    handleFieldChange,
    handlePrev,
    handleNext,
    handleAcceptPrivacy,
    handleAnalysisContinue,
    handleGeneratePdf,
    handleClarificationComplete,
    handleVoiceDataExtracted,
    handleVoiceSwitchToText,
    selectUpdateSection,
    handleExitWizard,
  } = useAnamnesisFlow();

  // --- RENDERS ---

  if (pageView === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
          <p className="mt-3 text-sm text-stone-500">Cargando tu anamnesis...</p>
        </div>
      </div>
    );
  }

  if (pageView === 'locked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
        <div className="max-w-md text-center">
          <Lock className="mx-auto h-12 w-12 text-stone-500" />
          <h1 className="mt-4 text-xl font-bold text-stone-900">Anamnesis en revisión</h1>
          <p className="mt-2 text-sm text-stone-600">
            Tu anamnesis está siendo revisada por tu equipo médico. No se pueden hacer cambios en este momento.
          </p>
          <a
            href="/patients/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border-2 border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-sky-200 hover:bg-sky-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al panel
          </a>
        </div>
      </div>
    );
  }

  if (showVoiceChat) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-stone-50 to-sky-50 p-4">
        <div className="mx-auto max-w-lg pt-8">
          <VoiceAnamnesis
            onDataExtracted={(data) => handleVoiceDataExtracted(data)}
            onSwitchToText={handleVoiceSwitchToText}
            guidance={guidance}
            checkpoint={pendingCheckpoint ?? undefined}
          />
        </div>
      </div>
    );
  }

  if (pageView === 'completed') {
    const completedSections = progress?.completed_sections ?? [];
    const totalSteps = anamnesisSteps.length;
    const completedCount = completedSections.length;

    const completedDate = anamnesis?.completed_at
      ? new Date(anamnesis.completed_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    return (
      <div className="min-h-screen bg-white">
        {/* Hero — video background, white text, immersive */}
        <div className="relative overflow-hidden bg-black">
          <video
            className="absolute inset-0 h-full w-full object-cover opacity-40"
            autoPlay
            muted
            loop
            playsInline
          >
            <source src="/videos/hero_background.mp4" type="video/mp4" />
          </video>
          <div className="relative px-6 pb-10 pt-12">
            <div className="mx-auto max-w-lg">
              <p className="text-sm font-medium text-white/60">
                {completedDate ?? 'Completada'}
              </p>
              <h1 className="mt-1 font-heading text-3xl font-bold text-white">
                Tu historia <span className="text-cyan-700">clínica</span>
              </h1>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-lg space-y-4 px-4 pb-8 pt-6">
          {/* Primary CTA — cyan accent on white */}
          <button
            onClick={() => handleGeneratePdf()}
            disabled={saving}
            className="flex w-full items-center gap-4 rounded-2xl bg-cyan-500 p-5 text-left text-white shadow-lg shadow-cyan-500/20 transition-all hover:bg-cyan-600 active:scale-[0.97] disabled:opacity-50"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20">
              {saving ? <Loader2 className="h-7 w-7 animate-spin" /> : <Download className="h-7 w-7" />}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight">Descargar PDF</p>
              <p className="text-sm text-white/70">Historia clínica completa</p>
            </div>
          </button>

          {/* Actions — clean black/white with cyan accent */}
          <div className="grid grid-cols-4 gap-3">
            <button
              onClick={() => setShowUpdatePicker(true)}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:border-cyan-300 hover:bg-cyan-50 active:scale-[0.95]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-stone-900">Actualizar</span>
            </button>
            <button
              onClick={() => setShowVoiceChat(true)}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-sky-200 bg-sky-50 p-4 transition-all hover:border-sky-400 hover:bg-sky-100 active:scale-[0.95]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500 text-white">
                <Mic className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-stone-900">Hablar</span>
            </button>
            <a
              href="/patients/dashboard"
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:border-cyan-300 hover:bg-cyan-50 active:scale-[0.95]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-black text-white">
                <ArrowLeft className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-stone-900">Mi panel</span>
            </a>
            <a
              href="/patients/appointments?type=telemedicine"
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-stone-200 bg-white p-4 transition-all hover:border-cyan-300 hover:bg-cyan-50 active:scale-[0.95]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-500 text-white">
                <PlayCircle className="h-6 w-6" />
              </div>
              <span className="text-xs font-bold text-stone-900">Consultar</span>
            </a>
          </div>

          {/* Secondary: collapsed by default */}
          <details className="group">
            <summary className="flex cursor-pointer items-center justify-between rounded-xl px-1 py-2 text-xs font-semibold text-stone-500 hover:text-stone-600">
              <span>Ver detalle de secciones</span>
              <span className="text-[10px] group-open:hidden">{completedCount}/{totalSteps}</span>
            </summary>
            <div className="flex flex-wrap gap-2 pt-2">
              {anamnesisSteps.map((step) => {
                const isComplete = completedSections.includes(step.id);
                const label = SECTION_SHORT_LABELS[step.id] ?? step.id;
                return (
                  <span
                    key={step.id}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${
                      isComplete
                        ? 'bg-black text-white'
                        : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {isComplete && <Check className="h-3 w-3" />}
                    {label}
                  </span>
                );
              })}
            </div>
          </details>

          {/* Version history: collapsed */}
          <VersionTimeline onDownload={handleGeneratePdf} />

          {saveError && (
            <div className="rounded-xl bg-red-50 p-3 text-center text-xs text-red-600">{saveError}</div>
          )}
        </div>

        {/* Update picker — "What do you want to update?" */}
        {showUpdatePicker && (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="absolute inset-0" onClick={() => setShowUpdatePicker(false)} />
            <div className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
              <h2 className="text-lg font-bold text-stone-900 mb-1">Que queres actualizar?</h2>
              <p className="text-sm text-stone-500 mb-4">Elegi la seccion y te llevamos directo</p>
              <div className="space-y-2">
                {UPDATE_PICKER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => selectUpdateSection(option.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-stone-100 bg-white px-4 py-3 text-left transition hover:border-sky-200 hover:bg-sky-50 active:scale-[0.98]"
                  >
                    <span className="text-xl">{option.icon}</span>
                    <span className="text-sm font-medium text-stone-900">{option.label}</span>
                  </button>
                ))}
                <button
                  onClick={() => selectUpdateSection('edad')}
                  className="w-full rounded-xl border border-dashed border-stone-200 px-4 py-3 text-sm text-stone-500 hover:text-stone-700"
                >
                  Revisar todo desde el inicio
                </button>
              </div>
              <button
                onClick={() => setShowUpdatePicker(false)}
                className="mt-3 w-full text-center text-sm text-stone-400 hover:text-stone-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (pageView === 'privacy') {
    return (
      <PrivacyAcceptanceScreen
        error={anamnesisError}
        saving={saving}
        onAccept={handleAcceptPrivacy}
      />
    );
  }

  // --- MODE SWITCH ---
  // (switchMode defined above early returns to maintain hook order)

  // --- CONVERSATIONAL MODE ---
  // editMode uses wizard to target a specific section — don't override with conversational
  if (anamnesisMode === 'conversational' && !editMode) {
    return (
      <ConversationalAnamnesis
        initialData={formData}
        onComplete={() => {
          // Refresh to show completed view
          window.location.reload();
        }}
        onSwitchMode={() => switchMode('wizard')}
        updateSection={updateSection}
        updateAnamnesis={updateAnamnesis as (update: Record<string, unknown>) => Promise<boolean>}
      />
    );
  }

  // --- WIZARD VIEW ---

  if (!currentStep) return null;

  return (
    <div className="flex min-h-screen flex-col bg-am-surface-50">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white shadow-am-xs">
        <div className="mx-auto max-w-2xl px-5 pb-4 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold tracking-tight text-stone-900">AutaMedica</span>
            <div className="flex items-center gap-3">
              {isExtracting && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
              )}
              <button
                onClick={() => switchMode('conversational')}
                className="rounded-full p-2 text-stone-400 transition-colors hover:bg-stone-50 hover:text-stone-600"
                title="Modo conversacional — una pregunta a la vez"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
              <button
                onClick={handleExitWizard}
                className="text-xs font-medium text-stone-400 transition-colors hover:text-stone-600"
              >
                {editMode ? 'Volver al resumen' : 'Guardar y salir'}
              </button>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="mt-4 flex items-center gap-3.5" data-tour="anamnesis-progress">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold tabular-nums text-white">
              {currentStepIndex + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
                  Paso {currentStepIndex + 1} de {anamnesisSteps.length}
                </p>
                <span className="text-[11px] font-medium tabular-nums text-stone-300">
                  {Math.round(completionPct)}%
                </span>
              </div>
              <div className="mt-1.5 h-[5px] w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-700 ease-out"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-8">
        <div data-tour="anamnesis-section">
          {/* Educational story */}
          {currentStep.story && (
            <div className="mb-8 overflow-hidden rounded-2xl bg-white shadow-am-sm ring-1 ring-stone-950/[0.03]" data-tour="educational-media">
              <div className="px-6 py-5">
                <p className="text-[15px] leading-relaxed text-stone-700">{currentStep.story.intro}</p>
                {currentStep.story.why && (
                  <p className="mt-3 text-sm leading-relaxed text-stone-500">{currentStep.story.why}</p>
                )}
              </div>
              {currentStep.story.example && (
                <div className="border-t border-stone-100 bg-stone-50/50 px-6 py-4">
                  <p className="whitespace-pre-line text-[13px] leading-relaxed text-stone-500">{currentStep.story.example}</p>
                </div>
              )}
              {currentStep.story.didYouKnow && (
                <div className="border-t border-stone-100 px-6 py-3">
                  <p className="text-xs italic text-stone-400">{currentStep.story.didYouKnow}</p>
                </div>
              )}
            </div>
          )}

          {/* Video */}
          {currentStep.mediaUrl && (
            <div className="mb-8 overflow-hidden rounded-2xl shadow-am-sm ring-1 ring-stone-950/[0.03]" data-tour="educational-media">
              <video
                src={currentStep.mediaUrl}
                controls
                preload="metadata"
                className="w-full"
              >
                <track kind="captions" />
              </video>
            </div>
          )}

          {/* Step title */}
          <h1 className="font-heading text-2xl font-bold tracking-tight text-stone-900 sm:text-[28px]">{currentStep.title}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-stone-400">{currentStep.subtitle}</p>

          {/* Revisit: carried-forward preview */}
          {isStepCarriedForward && !editingCarriedStep ? (
            <div className="mt-8 space-y-5">
              <div className="overflow-hidden rounded-2xl bg-white shadow-am-sm ring-1 ring-stone-950/[0.03]">
                <div className="border-b border-stone-100 px-6 py-4">
                  <p className="text-[13px] font-semibold text-stone-800">
                    {currentStep.mutability === 'carry_forward_additive'
                      ? 'Datos anteriores — ¿hay algo nuevo?'
                      : 'Datos anteriores — ¿cambió algo?'}
                  </p>
                </div>
                <div className="divide-y divide-stone-100/70 px-6">
                  {currentStep.fields.filter(f => formData[currentStep.id]?.[f.id] != null).map(f => {
                    const val = formData[currentStep.id]?.[f.id];
                    const display = val === true ? 'Sí' : val === false ? 'No'
                      : Array.isArray(val) ? (val as string[]).join(', ') || 'Ninguno'
                      : String(val ?? '');
                    return (
                      <div key={f.id} className="flex items-center justify-between py-3.5">
                        <span className="text-sm text-stone-500">{f.label}</span>
                        <span className="max-w-[55%] truncate text-right text-sm font-semibold text-stone-900">{display}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditingCarriedStep(true)}
                  className="flex-1 rounded-xl border border-stone-200 bg-white px-5 py-3.5 text-sm font-semibold text-stone-700 shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                >
                  {currentStep.mutability === 'carry_forward_additive' ? 'Sí, agregar datos' : 'Sí, actualizar'}
                </button>
                <button
                  onClick={handleNext}
                  className="flex-1 rounded-xl bg-stone-900 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.98]"
                >
                  No cambió nada
                </button>
              </div>
            </div>
          ) : (
          /* Fields — normal edit mode */
          <div className="mt-8 space-y-6" data-tour="anamnesis-field">
            {visibleFields.map((field) => (
              <AnamnesisFieldRenderer
                key={field.id}
                field={field}
                value={formData[currentStep.id]?.[field.id] ?? null}
                onChange={(val) => handleFieldChange(field.id, val)}
              />
            ))}
          </div>
          )}

          {/* Save error */}
          {saveError && (
            <p className="mt-4 text-center text-xs text-red-600">{saveError}</p>
          )}
        </div>
      </main>

      {/* Navigation */}
      <footer
        className="sticky bottom-0 bg-white shadow-am-sticky-top"
        data-tour="navigation-buttons"
      >
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <button
            onClick={handlePrev}
            disabled={isFirstStep || saving}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-medium text-stone-400 transition-all hover:bg-stone-50 hover:text-stone-600 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>

          <button
            onClick={handleNext}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-stone-900 px-7 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-stone-800 active:scale-[0.97] disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isLastStep ? (
              <>
                Finalizar
                <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Siguiente
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </footer>

      {/* AI Analysis checkpoint overlay */}
      {showAnalyzing && (
        <AnalysisResultOverlay
          analysisResult={analysisResult}
          onContinue={handleAnalysisContinue}
          isFinal={pendingCheckpoint === 'final'}
          preferVoice={pendingCheckpoint === 'partial'}
        />
      )}

      {/* AI Clarification overlay */}
      {showClarification && guidance && (
        <AnamnesisChatModal
          checkpoint={pendingCheckpoint || 'partial'}
          guidance={guidance}
          onClose={() => setShowClarification(false)}
          onComplete={(turns) => {
            void handleClarificationComplete(turns);
          }}
        />
      )}

      {/* Guided tour (first visit) */}
      {pageView === 'wizard' && user && (
        <AnamnesisFlowTour autoStart currentStep={currentStepIndex} />
      )}
    </div>
  );
}
