'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Loader2,
  Lock,
  PlayCircle,
  Shield,
} from 'lucide-react';
import { usePatientSession } from '@/hooks/patients/usePatientSession';
import { useAnamnesis } from '@/hooks/patients/useAnamnesis';
import { useAnamnesisGuidance } from '@/hooks/patients/useAnamnesisGuidance';
import { anamnesisSteps } from '@/lib/patients/data/anamnesis-steps';
import { AnamnesisField as AnamnesisFieldRenderer } from '@/components/patients/anamnesis/AnamnesisField';
import { PausaCognitiva } from '@/components/patients/anamnesis/PausaCognitiva';
import { ClarificationStep } from '@/components/patients/anamnesis/ClarificationStep';
import { AnamnesisFlowTour } from '@/components/patients/tours/AnamnesisFlowTour';
import type { AnamnesisFieldValue } from '@/lib/patients/types/anamnesis';
import type { AnamnesisSection } from '@autamedica/types';

const PAUSE_EVERY_N_STEPS = 4;
const PARTIAL_CHECKPOINT_AFTER_STEP = 6; // Checkpoint 1: after step index 5 (step 6 of 13)

type FormDataMap = Record<string, Record<string, AnamnesisFieldValue>>;

type PageView = 'loading' | 'privacy' | 'wizard' | 'completed' | 'locked';

export default function AnamnesisPage() {
  const { user, loading: sessionLoading } = usePatientSession();
  const {
    anamnesis,
    sections,
    progress,
    loading: anamnesisLoading,
    error: anamnesisError,
    updateAnamnesis,
    updateSection,
  } = useAnamnesis();

  const {
    guidance,
    isExtracting,
    triggerExtraction,
    addClarification,
    dismissGuidance,
  } = useAnamnesisGuidance();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [formData, setFormData] = useState<FormDataMap>({});
  const [showPause, setShowPause] = useState(false);
  const [showClarification, setShowClarification] = useState(false);
  const [pendingCheckpoint, setPendingCheckpoint] = useState<'partial' | 'final' | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  // Determine page view
  const pageView: PageView = useMemo(() => {
    if (sessionLoading || anamnesisLoading) return 'loading';
    if (anamnesis?.locked) return 'locked';
    if (anamnesis?.status === 'completed' || anamnesis?.status === 'approved') return 'completed';
    if (!anamnesis?.privacy_accepted || !anamnesis?.terms_accepted) return 'privacy';
    return 'wizard';
  }, [sessionLoading, anamnesisLoading, anamnesis]);

  // Initialize form data from saved sections and resume position
  useEffect(() => {
    if (initializedRef.current || sections.length === 0) return;
    initializedRef.current = true;

    const saved: FormDataMap = {};
    for (const section of sections) {
      saved[section.section] = section.data as Record<string, AnamnesisFieldValue>;
    }
    setFormData(saved);

    if (progress?.completed_sections) {
      const firstIncomplete = anamnesisSteps.findIndex(
        (s) => !progress.completed_sections.includes(s.id),
      );
      if (firstIncomplete > 0) {
        setCurrentStepIndex(firstIncomplete);
      }
    }
  }, [sections, progress]);

  const currentStep = anamnesisSteps[currentStepIndex];
  const isLastStep = currentStepIndex === anamnesisSteps.length - 1;
  const isFirstStep = currentStepIndex === 0;
  const completionPct = progress?.completion_percentage ?? 0;

  // Visible fields (respecting dependsOn)
  const visibleFields = useMemo(() => {
    if (!currentStep) return [];
    const stepData = formData[currentStep.id] ?? {};
    return currentStep.fields.filter((field) => {
      if (!field.dependsOn) return true;
      return stepData[field.dependsOn.fieldId] === field.dependsOn.value;
    });
  }, [currentStep, formData]);

  const handleFieldChange = useCallback(
    (fieldId: string, value: AnamnesisFieldValue) => {
      if (!currentStep) return;
      setFormData((prev) => ({
        ...prev,
        [currentStep.id]: {
          ...(prev[currentStep.id] ?? {}),
          [fieldId]: value,
        },
      }));
      setSaveError(null);
    },
    [currentStep],
  );

  const saveCurrentStep = useCallback(async (): Promise<boolean> => {
    if (!currentStep) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const stepData = formData[currentStep.id] ?? {};
      const ok = await updateSection(currentStep.id as AnamnesisSection, stepData);
      if (!ok) {
        setSaveError('No se pudo guardar esta sección');
        return false;
      }
      return true;
    } catch {
      setSaveError('Error al guardar');
      return false;
    } finally {
      setSaving(false);
    }
  }, [currentStep, formData, updateSection]);

  const handleNext = useCallback(async () => {
    const saved = await saveCurrentStep();
    if (!saved) return;

    // Checkpoint 2 (final): before marking completed
    if (isLastStep) {
      setPendingCheckpoint('final');
      const result = await triggerExtraction('final');
      if (result?.hasCritical) {
        setShowClarification(true);
        return;
      }
      // No critical questions or extraction failed — complete
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
      return;
    }

    const nextIndex = currentStepIndex + 1;

    // Checkpoint 1 (partial): after step 6 — non-blocking
    if (currentStepIndex + 1 === PARTIAL_CHECKPOINT_AFTER_STEP) {
      setPendingCheckpoint('partial');
      // Fire and don't wait — if questions come back, show before advancing
      triggerExtraction('partial').then(result => {
        if (result && result.questions.length > 0) {
          setShowClarification(true);
        }
      });
    }

    if ((nextIndex) % PAUSE_EVERY_N_STEPS === 0 && nextIndex < anamnesisSteps.length) {
      setShowPause(true);
      return;
    }

    setCurrentStepIndex(nextIndex);
  }, [saveCurrentStep, isLastStep, currentStepIndex, updateAnamnesis, triggerExtraction]);

  const handlePrev = useCallback(() => {
    if (!isFirstStep) {
      setCurrentStepIndex((prev) => prev - 1);
      setSaveError(null);
    }
  }, [isFirstStep]);

  const handlePauseContinue = useCallback(() => {
    setShowPause(false);
    setCurrentStepIndex((prev) => prev + 1);
  }, []);

  const handleClarificationSubmit = useCallback(async (
    answers: { question: string; answer: string }[],
  ) => {
    // Store clarification turns
    for (const a of answers) {
      addClarification(a.question, a.answer);
    }

    setShowClarification(false);

    // If this was the final checkpoint, complete the anamnesis
    if (pendingCheckpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
    }

    setPendingCheckpoint(null);
    dismissGuidance();
  }, [addClarification, pendingCheckpoint, updateAnamnesis, dismissGuidance]);

  const handleClarificationSkip = useCallback(async () => {
    setShowClarification(false);

    if (pendingCheckpoint === 'final') {
      await updateAnamnesis({ status: 'completed' } as Record<string, unknown>);
    }

    setPendingCheckpoint(null);
    dismissGuidance();
  }, [pendingCheckpoint, updateAnamnesis, dismissGuidance]);

  const handleAcceptPrivacy = useCallback(async () => {
    setSaving(true);
    await updateAnamnesis({
      privacy_accepted: true,
      terms_accepted: true,
    } as Record<string, unknown>);
    setSaving(false);
  }, [updateAnamnesis]);

  // --- RENDERS ---

  if (pageView === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-emerald-600" />
          <p className="mt-3 text-sm text-stone-500">Cargando tu anamnesis...</p>
        </div>
      </div>
    );
  }

  if (pageView === 'locked') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
        <div className="max-w-md text-center">
          <Lock className="mx-auto h-12 w-12 text-stone-400" />
          <h1 className="mt-4 text-xl font-bold text-stone-900">Anamnesis en revisión</h1>
          <p className="mt-2 text-sm text-stone-600">
            Tu anamnesis está siendo revisada por tu equipo médico. No se pueden hacer cambios en este momento.
          </p>
          <a
            href="/patients/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg border-2 border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver al panel
          </a>
        </div>
      </div>
    );
  }

  if (pageView === 'completed') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
        <div className="max-w-md text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-emerald-500" />
          <h1 className="mt-4 text-2xl font-bold text-stone-900">Anamnesis completada</h1>
          <p className="mt-2 text-sm text-stone-600">
            Tu historia clínica ha sido registrada. Tu médico tendrá acceso a esta información durante la próxima consulta.
          </p>
          <a
            href="/patients/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
          >
            Volver al panel
          </a>
        </div>
      </div>
    );
  }

  if (pageView === 'privacy') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-stone-50 to-sky-50 p-6">
        <div className="max-w-lg rounded-2xl border-2 border-stone-200 bg-white p-8 shadow-sm">
          <Shield className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-center text-xl font-bold text-stone-900">
            Tu historia clínica digital
          </h1>
          <p className="mt-3 text-center text-sm text-stone-600">
            Vamos a hacerte algunas preguntas sobre tu salud. Esta información es confidencial y solo será compartida con tu equipo médico.
          </p>

          <div className="mt-6 space-y-3 rounded-xl bg-stone-50 p-4">
            <h2 className="text-sm font-semibold text-stone-800">Antes de comenzar:</h2>
            <ul className="space-y-2 text-sm text-stone-600">
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>El formulario tiene 13 pasos con contenido educativo</span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>Puedes pausar y retomar cuando quieras</span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>Cada 4 pasos habrá una pausa para descansar</span>
              </li>
              <li className="flex gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>Tus datos se guardan automáticamente</span>
              </li>
            </ul>
          </div>

          <div className="mt-6 space-y-3 text-xs text-stone-500">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked disabled className="mt-0.5 accent-emerald-600" />
              <span>
                Acepto que mis datos de salud sean almacenados de forma segura y compartidos únicamente con mi equipo médico.
              </span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked disabled className="mt-0.5 accent-emerald-600" />
              <span>
                Comprendo que puedo solicitar la eliminación de mis datos en cualquier momento.
              </span>
            </label>
          </div>

          {anamnesisError && (
            <p className="mt-4 text-center text-xs text-red-600">{anamnesisError}</p>
          )}

          <button
            onClick={handleAcceptPrivacy}
            disabled={saving}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            Comenzar anamnesis
          </button>

          <a
            href="/patients/dashboard"
            className="mt-3 block text-center text-xs text-stone-400 transition-colors hover:text-stone-600"
          >
            Completar más tarde
          </a>
        </div>
      </div>
    );
  }

  // --- WIZARD VIEW ---

  if (!currentStep) return null;

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-stone-50 to-sky-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="text-sm font-semibold text-emerald-700">AutaMedica</span>
          <span className="flex items-center gap-1.5 text-xs text-stone-500">
            {isExtracting && (
              <Loader2 className="h-3 w-3 animate-spin text-sky-500" />
            )}
            Paso {currentStepIndex + 1} de {anamnesisSteps.length}
          </span>
          <a
            href="/patients/dashboard"
            className="text-xs text-stone-400 transition-colors hover:text-stone-600"
          >
            Guardar y salir
          </a>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-stone-100" data-tour="anamnesis-progress">
          <div
            className="h-full bg-emerald-500 transition-all duration-500 ease-out"
            style={{ width: `${completionPct}%` }}
          />
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <div data-tour="anamnesis-section">
          {/* Educational story */}
          {currentStep.story && (
            <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50 p-5" data-tour="educational-media">
              <p className="text-sm leading-relaxed text-sky-900">{currentStep.story.intro}</p>
              {currentStep.story.why && (
                <p className="mt-3 text-sm leading-relaxed text-sky-800">{currentStep.story.why}</p>
              )}
              {currentStep.story.example && (
                <div className="mt-3 whitespace-pre-line rounded-lg bg-white/60 p-3 text-xs text-sky-700">
                  {currentStep.story.example}
                </div>
              )}
              {currentStep.story.didYouKnow && (
                <p className="mt-3 text-xs italic text-sky-600">{currentStep.story.didYouKnow}</p>
              )}
            </div>
          )}

          {/* Video */}
          {currentStep.mediaUrl && (
            <div className="mb-6 overflow-hidden rounded-xl" data-tour="educational-media">
              <video
                src={currentStep.mediaUrl}
                controls
                preload="metadata"
                className="w-full rounded-xl"
              >
                <track kind="captions" />
              </video>
            </div>
          )}

          {/* Step title */}
          <h1 className="text-xl font-bold text-stone-900 sm:text-2xl">{currentStep.title}</h1>
          <p className="mt-1 text-sm text-stone-500">{currentStep.subtitle}</p>

          {/* Fields */}
          <div className="mt-6 space-y-5" data-tour="anamnesis-field">
            {visibleFields.map((field) => (
              <AnamnesisFieldRenderer
                key={field.id}
                field={field}
                value={(formData[currentStep.id]?.[field.id] ?? null) as AnamnesisFieldValue}
                onChange={(val) => handleFieldChange(field.id, val)}
              />
            ))}
          </div>

          {/* Save error */}
          {saveError && (
            <p className="mt-4 text-center text-xs text-red-600">{saveError}</p>
          )}
        </div>
      </main>

      {/* Navigation */}
      <footer
        className="sticky bottom-0 border-t border-stone-200 bg-white/80 backdrop-blur-sm"
        data-tour="navigation-buttons"
      >
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <button
            onClick={handlePrev}
            disabled={isFirstStep || saving}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-stone-200 px-4 py-2 text-sm font-medium text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <ArrowLeft className="h-4 w-4" />
            Anterior
          </button>

          <button
            onClick={handleNext}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
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

      {/* AI Clarification overlay */}
      {showClarification && guidance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 backdrop-blur-sm">
          <ClarificationStep
            guidance={guidance}
            isPartial={pendingCheckpoint === 'partial'}
            onSubmit={handleClarificationSubmit}
            onSkip={handleClarificationSkip}
            isSubmitting={saving}
          />
        </div>
      )}

      {/* Cognitive pause overlay */}
      {showPause && (
        <PausaCognitiva stepNumber={currentStepIndex + 1} onContinue={handlePauseContinue} />
      )}

      {/* Guided tour (first visit) */}
      {pageView === 'wizard' && user && (
        <AnamnesisFlowTour autoStart currentStep={currentStepIndex} />
      )}
    </div>
  );
}
